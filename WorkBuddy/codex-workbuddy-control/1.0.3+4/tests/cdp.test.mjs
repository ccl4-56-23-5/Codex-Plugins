import { strict as assert } from "node:assert";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createCdpClient } from "../plugins/codex-workbuddy-control/skills/control-workbuddy/cdp.mjs";

test("Electron pipe reassembles split UTF-8 frames and routes replies by ID", async () => {
  const send = new PassThrough();
  const receive = new PassThrough();
  const commands = [];
  send.on("data", (chunk) => commands.push(JSON.parse(chunk.toString().slice(0, -1))));
  const cdp = createCdpClient(send, receive);
  try {
    const first = cdp.request("Target.getTargets");
    const second = cdp.request("Runtime.evaluate", {}, { sessionId: "task-window" });
    assert.equal(commands[1].sessionId, "task-window");
    const response = Buffer.from(JSON.stringify({
      id: commands[1].id,
      sessionId: "task-window",
      result: { value: "任务" },
    }) + "\0");
    const splitAt = response.indexOf(Buffer.from("任")) + 1;
    receive.write(response.subarray(0, splitAt));
    receive.write(response.subarray(splitAt));
    receive.write(JSON.stringify({ id: commands[0].id, result: { targetInfos: [] } }) + "\0");
    assert.deepEqual(await first, { targetInfos: [] });
    assert.deepEqual(await second, { value: "任务" });
  } finally {
    cdp.dispose();
    receive.destroy();
    send.destroy();
  }
});

test("a lost WorkBuddy pipe rejects a pending request", async () => {
  const send = new PassThrough();
  const receive = new PassThrough();
  const cdp = createCdpClient(send, receive);
  const response = assert.rejects(cdp.request("Target.getTargets"), /closed|关闭/i);
  receive.destroy();
  await response;
  send.destroy();
});
