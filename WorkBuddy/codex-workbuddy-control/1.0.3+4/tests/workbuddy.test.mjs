import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createWorkbench } from "../plugins/codex-workbuddy-control/skills/control-workbuddy/dom.mjs";

const initialTask = {
  readable: true,
  taskId: null,
  scope: "welcome",
  welcome: true,
  running: false,
  composer: { draft: "", sendEnabled: false, canStop: false },
  messages: [],
  controls: [{ kind: "newTask", label: "新建任务", enabled: true, task: null }],
};

function simulatedWorkbench() {
  const actions = [];
  const state = structuredClone(initialTask);
  const evaluate = async (fn, action, args) => {
    if (action === "observe") return structuredClone(state);
    actions.push({ action, args });
    if (args.scope !== state.scope) return { error: "WorkBuddy 当前任务已变化" };
    if (action === "newTask") return { issued: false };
    if (action === "draft") {
      state.composer.draft = args.text;
      state.composer.sendEnabled = true;
    }
    if (action === "send") {
      if (state.composer.draft !== args.text) return { error: "草稿已变化" };
      state.composer.draft = "";
      state.composer.sendEnabled = false;
      state.scope = "task/test";
      state.taskId = "test";
      state.welcome = false;
      state.messages.push({ id: "1", role: "user", text: args.text });
    }
    return { issued: true };
  };
  return { actions, state, board: createWorkbench(evaluate) };
}

test("new task, exact draft and one send are confirmed by the current message list", async () => {
  const { board, actions } = simulatedWorkbench();
  await board.observe();
  assert.equal((await board.newTask()).transition, "confirmed");
  assert.equal((await board.draft("本机任务")).composer.draft, "本机任务");
  await assert.rejects(board.send("错误草稿"), /草稿/);
  const sent = await board.send("本机任务");
  assert.equal(sent.transition, "confirmed");
  assert.deepEqual(sent.messages, [{ id: "1", role: "user", text: "本机任务" }]);
  assert.equal(actions.filter(({ action }) => action === "send").length, 1);
  await assert.rejects(board.send("本机任务"), /草稿/);
});

test("changed task scope does not send the previously read draft", async () => {
  const { board, state } = simulatedWorkbench();
  await board.observe();
  await board.draft("本机任务");
  state.scope = "task/another";
  await assert.rejects(board.send("本机任务"), /任务已变化/);
  assert.deepEqual(state.messages, []);
  assert.equal(state.composer.draft, "本机任务");
});

test("a fresh observation invalidates previous control IDs", async () => {
  const { board, actions } = simulatedWorkbench();
  const old = await board.observe();
  await board.observe();
  await assert.rejects(board.click(old.controls[0].id), /失效/);
  assert.deepEqual(actions, []);
});

test("5.11.3 can use the main panel and a data-selected tab without a chat-container", async () => {
  function element({ attributes = {}, classes = [], text = "", children = [] } = {}) {
    return {
      children,
      innerText: text,
      textContent: text,
      dataset: {},
      getAttribute: (name) => attributes[name] ?? null,
      getClientRects: () => [{}],
      classList: { contains: (name) => classes.includes(name) },
      matches: (selector) => selector.split(", ").some((part) => {
        if (part === ":disabled") return false;
        if (part.startsWith(".")) return classes.includes(part.slice(1));
        const pair = /\[([^=]+)="([^"]+)"\]/.exec(part);
        return pair && attributes[pair[1]] === pair[2];
      }),
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }
  const newTask = element({ attributes: { "data-selected": "true" }, text: "新建任务" });
  const main = element({ classes: ["layout-window-frame__body"] });
  main.getClientRects = () => [];
  const editor = element();
  const send = element({ attributes: { "aria-label": "发送", "aria-disabled": "true" } });
  main.querySelectorAll = (selector) => {
    if (selector.startsWith(".cr-input-editor-host")) return [editor];
    if (selector.startsWith("button.cr-send-button")) return [send];
    return [];
  };
  const document = {
    querySelectorAll: (selector) => {
      if (selector.startsWith("button[role=")) return [newTask];
      if (selector === '.layout-window-frame__body[data-view-id="main-content"]') return [main];
      return [];
    },
  };
  const evaluate = (fn, ...args) => runInNewContext(`(${fn})(...${JSON.stringify(args)})`, {
    document,
    getComputedStyle: () => ({ visibility: "visible" }),
    location: { hash: "", pathname: "/renderer/index.html" },
  });
  const state = await createWorkbench(evaluate).observe();
  assert.equal(state.welcome, true);
  assert.equal(state.scope, "welcome");
  assert.equal(state.composer.draft, "");
  assert.equal(state.composer.sendEnabled, false);
});
