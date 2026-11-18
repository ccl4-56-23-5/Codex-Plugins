import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL = 2;
const STARTUP_MS = 5000;
const HANDSHAKE_MS = 4000;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 120000;

function endpoint() {
  const localAppData = process.env.LOCALAPPDATA;
  if (process.platform !== "win32" || !localAppData || !isAbsolute(localAppData)) {
    throw new Error("WorkBuddy Control 需要 Windows 用户的 LocalAppData 目录。");
  }
  const directory = join(localAppData, "CodexWorkBuddy", "broker-v" + PROTOCOL);
  const profile = createHash("sha256").update(directory.toLowerCase()).digest("hex").slice(0, 24);
  return {
    pipe: "\\\\.\\pipe\\CodexWorkBuddy-v" + PROTOCOL + "-" + profile,
    directory,
    keyFile: join(directory, "key"),
  };
}

function protocolError(message, code) {
  return Object.assign(new Error(message), { code });
}

function proof(key, side, handshake, value = "") {
  return createHmac("sha256", key)
    .update("WorkBuddy Control:" + PROTOCOL + ":" + side + ":" + handshake + ":" + value)
    .digest("hex");
}

function matchesProof(candidate, expected) {
  return typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate) &&
    timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
}

function seal(key, side, handshake, value) {
  const payload = JSON.stringify(value);
  return { payload, proof: proof(key, side, handshake, payload) };
}

function unseal(key, side, handshake, envelope) {
  if (typeof envelope?.payload !== "string" ||
      !matchesProof(envelope.proof, proof(key, side, handshake, envelope.payload))) {
    throw protocolError("无法验证 WorkBuddy 桥接数据。", "WB_IPC_AUTH");
  }
  return JSON.parse(envelope.payload);
}

function readFrame(socket, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => finish(protocolError("等待 WorkBuddy 桥接响应超时。", "WB_IPC_TIMEOUT")), timeoutMs);

    function finish(error, value) {
      clearTimeout(timer);
      socket.off("data", receive);
      socket.off("error", fail);
      socket.off("close", closed);
      if (error) reject(error);
      else resolve(value);
    }

    function fail(error) {
      finish(error);
    }

    function closed() {
      finish(protocolError("WorkBuddy 桥接连接已关闭。", "WB_IPC_CLOSED"));
    }

    function receive(chunk) {
      const newline = chunk.indexOf(10);
      bytes += newline < 0 ? chunk.length : newline;
      if (bytes > maxBytes || (newline >= 0 && newline + 1 !== chunk.length)) {
        finish(protocolError("WorkBuddy 桥接数据长度或帧格式无效。", "WB_IPC_PROTOCOL"));
        return;
      }
      if (newline < 0) {
        chunks.push(chunk);
        return;
      }
      chunks.push(chunk.subarray(0, newline));
      try {
        finish(null, JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")));
      } catch {
        finish(protocolError("WorkBuddy 桥接数据无法解析。", "WB_IPC_PROTOCOL"));
      }
    }

    socket.on("data", receive);
    socket.once("error", fail);
    socket.once("close", closed);
    if (socket.destroyed) closed();
  });
}

function frame(value, maxBytes) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > maxBytes) {
    throw protocolError("WorkBuddy 桥接数据超出长度限制。", "WB_IPC_SIZE");
  }
  return json + "\n";
}

function connect(pipe, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(pipe);
    const timeout = setTimeout(() => fail(protocolError("连接 WorkBuddy 桥接超时。", "WB_IPC_TIMEOUT")), timeoutMs);
    socket.on("error", () => {});
    socket.once("error", fail);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.off("error", fail);
      resolve(socket);
    });

    function fail(error) {
      clearTimeout(timeout);
      socket.destroy();
      reject(error);
    }
  });
}

function unavailable(error) {
  return ["ENOENT", "ECONNREFUSED", "EPIPE"].includes(error.code);
}

function spawnBroker(nodePath, brokerPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [brokerPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function createIpcClient(brokerPath, { nodePath = process.execPath } = {}) {
  const script = brokerPath instanceof URL ? fileURLToPath(brokerPath) : brokerPath;
  let starting;

  async function openPipe(pipe, shouldStart, deadline) {
    try {
      return await connect(pipe, Math.max(1, Math.min(HANDSHAKE_MS, deadline - Date.now())));
    } catch (error) {
      if (!unavailable(error)) throw error;
      if (!shouldStart) {
        throw protocolError("WorkBuddy 桥接未启动。请先调用 open()。", "WB_IPC_OFFLINE");
      }
    }

    if (!starting) {
      if (!isAbsolute(script) || !isAbsolute(nodePath)) {
        throw new Error("WorkBuddy 桥接脚本和 Node.js 必须使用完整路径。");
      }
      starting = spawnBroker(nodePath, script).finally(() => { starting = undefined; });
    }
    await starting;
    const startupDeadline = Math.min(Date.now() + STARTUP_MS, deadline);
    do {
      try {
        return await connect(pipe, Math.max(1, startupDeadline - Date.now()));
      } catch (error) {
        if (!unavailable(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
    } while (Date.now() < startupDeadline);
    throw protocolError("WorkBuddy 桥接未能启动。", "WB_IPC_OFFLINE");
  }

  return {
    async call(method, args = {}, { start = false, timeoutMs = 45000 } = {}) {
      if (typeof method !== "string" || !/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(method) ||
          (start && method !== "open") || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
        throw new TypeError("无效的 WorkBuddy 桥接调用。");
      }

      const { pipe, keyFile } = endpoint();
      const deadline = Date.now() + timeoutMs;
      const timeLeft = () => Math.max(1, deadline - Date.now());
      const socket = await openPipe(pipe, start, deadline);
      let issued = false;
      try {
        const nonce = randomBytes(24).toString("hex");
        const greeting = readFrame(socket, 4096, Math.min(HANDSHAKE_MS, timeLeft()));
        socket.write(frame({ version: PROTOCOL, nonce }, 4096));
        const hello = await greeting;
        const key = await readFile(keyFile);
        const handshake = nonce + ":" + hello?.nonce;
        if (key.length !== 32 || hello?.version !== PROTOCOL ||
            !/^[a-f0-9]{48}$/.test(hello.nonce) || !matchesProof(hello.proof, proof(key, "server", handshake))) {
          throw protocolError("无法验证 WorkBuddy 桥接身份。", "WB_IPC_AUTH");
        }
        if (Date.now() >= deadline) {
          throw protocolError("WorkBuddy 桥接调用已超过等待期限。", "WB_IPC_TIMEOUT");
        }
        const request = frame(seal(key, "request", handshake, { method, args, deadline }), MAX_REQUEST_BYTES);
        const pending = readFrame(socket, MAX_RESPONSE_BYTES, timeLeft());
        issued = true;
        socket.write(request);
        const response = unseal(key, "response", handshake, await pending);
        if (response?.ok === true) return response.value;
        if (response?.ok === false && typeof response.message === "string") {
          throw protocolError(response.message, response.code || "WB_IPC_REMOTE");
        }
        throw protocolError("WorkBuddy 桥接未返回有效回执。", "WB_IPC_PROTOCOL");
      } catch (error) {
        if (issued && ["WB_IPC_TIMEOUT", "WB_IPC_CLOSED", "WB_IPC_PROTOCOL", "WB_IPC_AUTH", "ECONNRESET", "EPIPE"].includes(error.code)) {
          throw new Error("WorkBuddy 桥接调用结果未知。请先刷新任务并核对结果，避免重复操作。", { cause: error });
        }
        throw error;
      } finally {
        socket.destroy();
      }
    },
  };
}

async function publishKey(directory, keyFile, key) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = keyFile + "." + randomBytes(12).toString("hex");
  try {
    await writeFile(temporary, key, { flag: "wx", mode: 0o600 });
    await rename(temporary, keyFile);
  } finally {
    await unlink(temporary).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export async function serveIpc(handler) {
  const { pipe, directory, keyFile } = endpoint();
  const key = randomBytes(32);
  const ready = Promise.withResolvers();
  ready.promise.catch(() => {});
  let queue = Promise.resolve();
  const server = createServer(socket => {
    socket.on("error", () => {});
    void (async () => {
      try {
        await ready.promise;
        if (socket.destroyed) return;
        const hello = await readFrame(socket, 4096, HANDSHAKE_MS);
        if (hello?.version !== PROTOCOL || !/^[a-f0-9]{48}$/.test(hello.nonce)) {
          socket.destroy();
          return;
        }
        const nonce = randomBytes(24).toString("hex");
        const handshake = hello.nonce + ":" + nonce;
        const waiting = readFrame(socket, MAX_REQUEST_BYTES, HANDSHAKE_MS);
        socket.write(frame({ version: PROTOCOL, nonce, proof: proof(key, "server", handshake) }, 4096));
        const request = unseal(key, "request", handshake, await waiting);
        const action = queue.then(async () => {
          if (socket.destroyed || !Number.isSafeInteger(request.deadline) || request.deadline < Date.now() ||
              request.deadline > Date.now() + MAX_TIMEOUT_MS) {
            throw protocolError("WorkBuddy 桥接调用在执行前已过期。", "WB_IPC_EXPIRED");
          }
          return handler(request.method, request.args);
        });
        queue = action.catch(() => {});
        try {
          const value = await action;
          if (!socket.destroyed) socket.end(frame(seal(key, "response", handshake, { ok: true, value }), MAX_RESPONSE_BYTES));
        } catch (error) {
          if (!socket.destroyed) {
            const message = String(error?.message || "WorkBuddy 桥接操作失败。").slice(0, 1200);
            const failure = seal(key, "response", handshake, { ok: false, message, code: error?.code });
            socket.end(frame(failure, MAX_RESPONSE_BYTES));
          }
        }
      } catch {
        socket.destroy();
      }
    })();
  });
  server.maxConnections = 32;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ path: pipe, exclusive: true }, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await publishKey(directory, keyFile, key);
    ready.resolve();
  } catch (error) {
    ready.reject(error);
    if (server.listening) server.close();
    throw error;
  }
  return server;
}
