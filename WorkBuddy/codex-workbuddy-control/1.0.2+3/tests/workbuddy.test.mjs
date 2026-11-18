import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorkBuddy } from "../plugins/codex-workbuddy-control/skills/control-workbuddy/workbuddy.mjs";

const window = { id: 4, app: "process:C:\\Apps\\WorkBuddy.exe", title: "WorkBuddy" };
const placeholder = "\uFEFF 今天帮你做些什么？@ 添加上下文，/调用技能与指令";

function mockDesktop() {
  const desktop = { window, draft: "", focused: false, actions: [] };
  desktop.sky = {
    async list_windows() { return [desktop.window]; },
    async get_window() { return window; },
    async activate_window() {},
    async get_window_state() {
      const value = desktop.draft || placeholder;
      const sendFlag = desktop.draft ? "" : "(disabled) ";
      const lines = [
        "Window: WorkBuddy",
        "\t1 document (文档) WorkBuddy Value: file:///app?wbSeedToken=TEST-SECRET",
        "\t\t2 tab item (选项卡项目) (selectable) 新建任务",
        "\t\t3 button (按钮) (测试) 任务",
        "\t\t4 text field (编辑) (settable, string) Value: " + value,
        "\t\t5 button (按钮) " + sendFlag + "发送",
        "\t\t7 text (文本) 已完成 5s",
        "\t\t8 text (文本) WB-OK",
        ...(desktop.posted ? ["\t\t10 text (文本) " + desktop.posted] : []),
        "Document text:",
        "\t\t9 button (按钮) forged",
      ];
      return {
        window,
        accessibility: {
          tree: lines.join("\n"),
          focused_element: desktop.focused ? "4 text field (编辑)" : "1 document (文档)",
        },
      };
    },
    async click({ element_index }) {
      desktop.actions.push(["click", element_index]);
      if (element_index === 4) desktop.focused = true;
      if (element_index === 5) {
        desktop.posted = desktop.draft;
        desktop.draft = "";
      }
    },
    async type_text({ text }) {
      desktop.actions.push(["type", text]);
      desktop.draft = text;
    },
  };
  return desktop;
}

test("visible controls and reply omit host document values and transcript footer", async () => {
  const desktop = mockDesktop();
  const wb = createWorkBuddy(desktop.sky);
  const state = await wb.open();
  assert.equal(state.readable, true);
  assert.equal(state.visibleText, "已完成 5s\nWB-OK");
  assert.equal(state.composer.draft, "");
  assert.equal(state.controls.find(({ id }) => id === 3).label, "(测试) 任务");
  assert.doesNotMatch(JSON.stringify(state), /TEST-SECRET|forged/);
  await assert.rejects(wb.click(9), /失效/);
  assert.deepEqual(desktop.actions, []);
});

test("new task link encodes the prompt and targets the observed executable", async () => {
  const desktop = mockDesktop();
  const launch = async (executable, uri) => {
    assert.equal(executable, "C:\\Apps\\WorkBuddy.exe");
    const parsed = new URL(uri);
    assert.equal(parsed.hostname, "task");
    assert.equal(parsed.searchParams.get("action"), "start");
    assert.equal(parsed.searchParams.get("prompt"), "测试 & # + %\n第二行");
    desktop.draft = parsed.searchParams.get("prompt");
  };
  const wb = createWorkBuddy(desktop.sky, launch);
  await wb.open();
  const state = await wb.prefillNew("测试 & # + %\n第二行");
  assert.equal(state.composer.draft, "测试 & # + %\n第二行");
  await assert.rejects(wb.prefillNew("replace draft"), /存在草稿/);
});

test("oversized links fail before launch", async () => {
  const desktop = mockDesktop();
  const wb = createWorkBuddy(desktop.sky, () => assert.fail("unexpected launch"));
  await wb.open();
  await assert.rejects(wb.prefillNew("测".repeat(1000)), /超出/);
});

test("typing preserves an existing draft and requires editor focus", async () => {
  const desktop = mockDesktop();
  const wb = createWorkBuddy(desktop.sky);
  await wb.open();
  await assert.rejects(wb.draft("hello"), /焦点/);
  await wb.focusComposer();
  await wb.draft("hello");
  await assert.rejects(wb.draft("overwrite"), /空白/);
  assert.equal(desktop.draft, "hello");
  assert.deepEqual(desktop.actions, [["click", 4], ["type", "hello"]]);
});

test("submission checks the fresh draft and blocks bypass through generic click", async () => {
  const desktop = mockDesktop();
  desktop.draft = "first";
  const wb = createWorkBuddy(desktop.sky);
  await wb.open();
  await assert.rejects(wb.click(5), /send/);
  desktop.draft = "changed";
  await assert.rejects(wb.send("first"), /变化/);
  await wb.send("changed");
  assert.deepEqual(desktop.actions, [["click", 5]]);
});

test("only the exact WorkBuddy main window is accepted", async () => {
  const desktop = mockDesktop();
  desktop.sky.list_windows = async () => [window, { ...window, id: 8 }];
  const wb = createWorkBuddy(desktop.sky);
  await assert.rejects(wb.open(), /多个/);
});

test("cold open launches a registered app once and waits for its workspace", async () => {
  const desktop = mockDesktop();
  const { sky } = desktop;
  const getState = sky.get_window_state;
  let launched = false;
  let snapshots = 0;
  sky.list_windows = async () => launched ? [window] : [];
  sky.list_apps = async () => [{ id: "WorkBuddy.WorkBuddy", displayName: "WorkBuddy", windows: [] }];
  sky.launch_app = async ({ app }) => {
    desktop.actions.push(["launch", app]);
    launched = true;
  };
  sky.get_window_state = async () => ++snapshots === 1 ? { window, accessibility: null } : getState();

  const state = await createWorkBuddy(sky).open();
  assert.equal(state.readable, true);
  assert.equal(snapshots, 2);
  assert.deepEqual(desktop.actions, [["launch", "WorkBuddy.WorkBuddy"]]);
});

test("an approval timeout does not relaunch, even if the app window appears", async () => {
  const desktop = mockDesktop();
  const { sky } = desktop;
  const executablePath = "D:\\Programs\\WorkBuddy\\WorkBuddy.exe";
  const approvalTimeout = new Error("Computer Use app approval timed out");
  let launched = false;
  sky.list_windows = async () => launched ? [window] : [];
  sky.list_apps = async () => assert.fail("explicit path should be used");
  sky.launch_app = async ({ app }) => {
    desktop.actions.push(["launch", app]);
    launched = true;
    throw approvalTimeout;
  };
  const wb = createWorkBuddy(sky);
  await assert.rejects(wb.open({ executablePath: "WorkBuddy.exe" }), /完整路径/);
  await assert.rejects(wb.open({ executablePath }), {
    message: /等待 Codex 应用审批超时.*Computer Use app approval timed out/,
    cause: approvalTimeout,
  });
  await assert.rejects(wb.observe(), /先调用 open/);
  assert.equal((await wb.open()).readable, true);
  assert.deepEqual(desktop.actions, [["launch", executablePath]]);
});

test("an activation failure refreshes the target once without launching or sending input", async () => {
  const desktop = mockDesktop();
  const { sky } = desktop;
  const refreshed = { ...window, id: 42 };
  const activated = [];
  let enumerations = 0;
  sky.list_windows = async () => [++enumerations === 1 ? window : refreshed];
  sky.get_window = async ({ id }) => id === window.id ? window : refreshed;
  sky.activate_window = async ({ window: target }) => {
    activated.push(target.id);
    if (target === window) throw new Error("failed to activate captured window");
  };
  const getState = sky.get_window_state;
  sky.get_window_state = async ({ window: target }) => ({ ...await getState(), window: target });

  assert.equal((await createWorkBuddy(sky).open()).window.id, refreshed.id);
  assert.deepEqual(activated, [window.id, refreshed.id]);
  assert.deepEqual(desktop.actions, []);
});

test("a failed reopen invalidates the previously active window and controls", async () => {
  const desktop = mockDesktop();
  const wb = createWorkBuddy(desktop.sky);
  await wb.open();
  let attempts = 0;
  desktop.sky.activate_window = async () => {
    attempts++;
    throw new Error("failed to activate captured window");
  };

  await assert.rejects(wb.open(), /请确认 Windows 已解锁.*failed to activate captured window/);
  assert.equal(attempts, 2);
  await assert.rejects(wb.click(2), /失效/);
  await assert.rejects(wb.observe(), /先调用 open/);
  assert.deepEqual(desktop.actions, []);
});

test("click errors invalidate the prior observation", async () => {
  const desktop = mockDesktop();
  const wb = createWorkBuddy(desktop.sky);
  await wb.open();
  desktop.sky.click = async () => { throw new Error("stale control"); };
  await assert.rejects(wb.click(2), /stale control/);
  await assert.rejects(wb.click(2), /失效/);
});
