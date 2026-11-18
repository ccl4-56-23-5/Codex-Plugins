const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_TIMEOUT_MS = 2_147_483_647;

function checkTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError("CDP timeout must be a positive integer within the Node timer range.");
  }
}

// Chromium reads NUL-terminated JSON from child FD 3 and writes replies to FD 4.
export function createCdpClient(sendStream, receiveStream, { timeoutMs = 10000 } = {}) {
  checkTimeout(timeoutMs);
  if (!sendStream?.write || !receiveStream?.on) {
    throw new TypeError("WorkBuddy CDP requires inherited stdio pipes 3 and 4.");
  }

  const pending = new Map();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let nextId = 0;
  let closedError;
  let frameParts = [];
  let frameLength = 0;

  function settle(id) {
    const request = pending.get(id);
    pending.delete(id);
    clearTimeout(request.timer);
    return request;
  }

  function dispose(reason = new Error("WorkBuddy CDP connection was disposed.")) {
    if (closedError) return;
    closedError = reason instanceof Error ? reason : new Error(String(reason));
    receiveStream.off("data", onData);
    frameParts = [];
    frameLength = 0;
    for (const id of pending.keys()) settle(id).reject(closedError);
  }

  function onPipeError(error) {
    dispose(new Error("WorkBuddy CDP pipe failed.", { cause: error }));
  }

  function onPipeEnd() {
    dispose(new Error("WorkBuddy CDP pipe closed."));
  }

  function onMessage(message) {
    if (message.method === "Target.detachedFromTarget" && message.params?.sessionId) {
      for (const [id, request] of pending) {
        if (request.sessionId === message.params.sessionId) {
          settle(id).reject(new Error("WorkBuddy CDP target session detached."));
        }
      }
      return;
    }

    const request = pending.get(message.id);
    if (!request || (message.sessionId !== undefined && message.sessionId !== request.sessionId)) return;
    settle(message.id);
    if (message.error) {
      const error = new Error(`${request.method}: ${message.error.message ?? "CDP request failed"}`);
      error.code = message.error.code;
      request.reject(error);
    } else {
      request.resolve(message.result);
    }
  }

  function onData(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    while (!closedError && offset < bytes.length) {
      const delimiter = bytes.indexOf(0, offset);
      const end = delimiter < 0 ? bytes.length : delimiter;
      const part = bytes.subarray(offset, end);
      frameLength += part.length;
      if (frameLength > MAX_FRAME_BYTES) {
        dispose(new Error("WorkBuddy CDP reply exceeded the frame size limit."));
        return;
      }
      if (part.length) frameParts.push(part);
      if (delimiter < 0) return;

      if (frameLength) {
        const frame = Buffer.concat(frameParts, frameLength);
        let message;
        try {
          message = JSON.parse(decoder.decode(frame));
          if (!message || typeof message !== "object" || Array.isArray(message)) {
            throw new Error("Expected a CDP message object.");
          }
        } catch (error) {
          dispose(new Error("WorkBuddy CDP returned an invalid JSON frame.", { cause: error }));
          return;
        }
        onMessage(message);
      }
      frameParts = [];
      frameLength = 0;
      offset = end + 1;
    }
  }

  sendStream.on("error", onPipeError);
  receiveStream.on("error", onPipeError);
  sendStream.once("finish", onPipeEnd);
  receiveStream.once("end", onPipeEnd);
  sendStream.once("close", () => {
    sendStream.off("error", onPipeError);
    sendStream.off("finish", onPipeEnd);
    onPipeEnd();
  });
  receiveStream.once("close", () => {
    receiveStream.off("error", onPipeError);
    receiveStream.off("end", onPipeEnd);
    onPipeEnd();
  });
  receiveStream.on("data", onData);
  if (sendStream.destroyed || sendStream.writableEnded || receiveStream.destroyed || receiveStream.readableEnded) {
    onPipeEnd();
  }

  async function request(method, params = {}, { sessionId, timeoutMs: requestTimeoutMs = timeoutMs } = {}) {
    if (closedError) throw closedError;
    checkTimeout(requestTimeoutMs);
    const id = ++nextId;
    const frame = `${JSON.stringify({ id, method, params, sessionId })}\0`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`${method} did not reply within ${requestTimeoutMs} ms.`);
        error.name = "TimeoutError";
        settle(id).reject(error);
      }, requestTimeoutMs);
      pending.set(id, { method, sessionId, resolve, reject, timer });
      try {
        sendStream.write(frame, "utf8", (error) => {
          if (error) onPipeError(error);
        });
      } catch (error) {
        onPipeError(error);
      }
    });
  }

  async function attach(targetId, options) {
    const { sessionId } = await request("Target.attachToTarget", { targetId, flatten: true }, options);
    if (typeof sessionId !== "string" || !sessionId) {
      throw new Error("WorkBuddy CDP did not return an attached target session.");
    }
    return sessionId;
  }

  async function evaluate(sessionId, expression, { timeoutMs: requestTimeoutMs, awaitPromise = true } = {}) {
    const reply = await request("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    }, { sessionId, timeoutMs: requestTimeoutMs });
    if (reply.exceptionDetails) {
      const details = reply.exceptionDetails;
      throw new Error(`WorkBuddy page evaluation failed: ${details.exception?.description?.split("\n", 1)[0] ?? details.text}`);
    }
    return reply.result.value;
  }

  return { request, attach, evaluate, dispose };
}
