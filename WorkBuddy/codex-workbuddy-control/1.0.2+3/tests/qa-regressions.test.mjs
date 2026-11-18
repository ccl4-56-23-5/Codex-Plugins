import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorkBuddy } from "../plugins/codex-workbuddy-control/skills/control-workbuddy/workbuddy.mjs";

const window = { id: 4, title: "WorkBuddy", app: "process:C:\\Apps\\WorkBuddy.exe" };
const placeholder = "\uFEFF 今天帮你做些什么？@ 添加上下文，/调用技能与指令";

function existingTask(options = {}) {
  const state = {
    draft: "", posted: [], generating: false, accountOpen: false,
    group: "", groupOpen: false, groupId: 20, mode: "indexed",
    model: "默认模型", modelOpen: false,
    actions: [], snapshots: 0, screenshots: 0, ...options,
  };
  let applyNext;
  let applyAfter;

  function renderAfterStaleSnapshot(update) {
    applyNext = update;
    applyAfter = state.snapshots + 2;
  }

  const sky = {
    async list_windows() { return [window]; },
    async get_window() { return window; },
    async activate_window() {},
    async get_window_state({ include_screenshot }) {
      if (++state.snapshots === applyAfter) {
        applyNext();
        applyNext = undefined;
      }
      const send = state.draft ? "发送" : state.generating ? "停止" : "(disabled) 发送";
      const tree = [
        "Window: WorkBuddy",
        "\t1 document (文档) WorkBuddy",
        "\t\t2 button (按钮) 已有测试任务",
        "\t\t3 text (文本) 已有测试任务",
        ...state.posted.map((message, index) => `\t\t${100 + index} text (文本) ${message}`),
        "\t\t10 menu item (菜单项) 测试账户 ID: wb-popover-trigger\\:r34\\:",
        ...(state.accountOpen ? [
          "\t\t11 menu (菜单) ID: wb-popover\\:r34\\:",
          "\t\t\t12 menu item (菜单项) 退出登录",
        ] : []),
        `\t\t${state.groupId} menu item (菜单项) ${state.group || "选择分组"}`,
        ...(state.groupOpen ? ["\t\t24 menu item (菜单项) 报告"] : []),
        "\t\t30 text field (编辑) (settable, string)" +
          (state.generating && !state.draft ? "" : ` Value: ${state.draft || placeholder}`),
        `\t\t31 button (按钮) Select model: ${state.model}`,
        `\t\t32 button (按钮) ${send}`,
        ...(state.modelOpen ? ["\t\t33 menu item (菜单项) mimo-v2.6-pro"] : []),
      ].join("\n");
      const screenshots = include_screenshot
        ? [{ id: `screenshot-${++state.screenshots}`, width: 800, height: 600, zIndex: 0 }]
        : [];
      return { window, screenshots, accessibility: {
        tree, focused_element: "1 document (文档)", selected_text: state.selected,
      } };
    },
    async click({ element_index, screenshotId, x, y }) {
      if (screenshotId) {
        state.actions.push(["point", screenshotId, x, y]);
        renderAfterStaleSnapshot(() => { state.groupOpen = true; });
        return;
      }
      state.actions.push(["click", element_index]);
      if (element_index === 10) {
        renderAfterStaleSnapshot(() => { state.accountOpen = false; state.groupId = 21; });
      } else if (element_index === state.groupId) {
        if (state.accountOpen || state.mode === "point") {
          throw new Error("coordinate input geometry is unavailable");
        }
        renderAfterStaleSnapshot(() => { state.groupOpen = true; });
      } else if (element_index === 24) {
        renderAfterStaleSnapshot(() => { state.group = "报告"; state.groupOpen = false; });
      } else if (element_index === 31) {
        renderAfterStaleSnapshot(() => { state.modelOpen = true; });
      } else if (element_index === 33) {
        renderAfterStaleSnapshot(() => { state.model = "mimo-v2.6-pro"; state.modelOpen = false; });
      } else if (element_index === 32 && state.draft) {
        const posted = state.draft;
        renderAfterStaleSnapshot(() => {
          state.posted.push(posted);
          state.draft = "";
          state.generating = true;
        });
      } else if (element_index === 32) {
        renderAfterStaleSnapshot(() => { state.generating = false; });
      }
    },
    async type_text({ text }) {
      state.actions.push(["type", text]);
      renderAfterStaleSnapshot(() => { state.draft = text; });
    },
    async press_key({ key }) {
      state.actions.push(["key", key]);
      if (key === "Control_L+a") {
        renderAfterStaleSnapshot(() => { state.selected = state.draft; });
      } else if (key === "BackSpace") {
        renderAfterStaleSnapshot(() => { state.draft = ""; state.selected = undefined; });
      }
    },
  };
  return { state, wb: createWorkBuddy(sky) };
}

test("existing task accepts follow-up after explicit visual confirmation when AX reports document focus", async () => {
  const { wb, state } = existingTask();
  await wb.open();
  await assert.rejects(wb.draft("测试续篇"), /焦点|输入框/);
  const focused = await wb.focusComposer();
  assert.equal(focused.composer.focused, false);
  assert.equal(focused.composer.visualFocusRequired, true);
  assert.ok(state.screenshots > 0);

  const drafted = await wb.draft("测试续篇", { visualFocus: true });
  assert.equal(drafted.composer.draft, "测试续篇");
  assert.equal(drafted.composer.sendEnabled, true);
  assert.deepEqual(state.actions, [["click", 30], ["type", "测试续篇"]]);

  const sent = await wb.send("测试续篇");
  assert.match(sent.visibleText, /测试续篇/);
  assert.equal(sent.composer.draft, "");
  assert.ok(sent.controls.some(({ label }) => label === "停止"));
  assert.equal(state.actions.filter(([, id]) => id === 32).length, 1);
});

test("clearing a guarded draft waits for Stop to replace Send in the existing task", async () => {
  const { wb, state } = existingTask({ draft: "·", generating: true });
  await wb.open();
  const cleared = await wb.clearDraft("·");
  assert.equal(cleared.composer.draft, "");
  const stop = cleared.controls.find(({ label }) => label === "停止");
  assert.ok(stop);
  const stopped = await wb.stop();
  assert.ok(!stopped.controls.some(({ label }) => label === "停止"));
  assert.deepEqual(state.actions, [
    ["click", 30], ["key", "Control_L+a"], ["key", "BackSpace"], ["click", 32],
  ]);
});

test("clearing does not modify a draft that changed since observation", async () => {
  const { wb, state } = existingTask({ draft: "·", generating: true });
  await wb.open();
  state.draft = "新草稿";
  await assert.rejects(wb.clearDraft("·"), /变化|不一致|匹配/);
  assert.deepEqual(state.actions, []);
  assert.equal(state.draft, "新草稿");
});

test("group click closes an account popover, resolves a fresh ID, and waits for the selected group", async () => {
  const { wb, state } = existingTask({ accountOpen: true });
  const initial = await wb.open();
  assert.ok(initial.controls.some(({ id, label }) => id === 20 && label === "选择分组"));
  const menu = await wb.click(20, {
    until: (snapshot) => snapshot.controls.some(({ label }) => label === "报告"),
  });
  const item = menu.controls.find(({ label }) => label === "报告");
  assert.ok(item);
  const selected = await wb.click(item.id, {
    until: (snapshot) => snapshot.controls.some(({ id, label }) => id !== item.id && label === "报告"),
  });
  assert.ok(selected.controls.some(({ id, label }) => id === 21 && label === "报告"));
  assert.deepEqual(state.actions, [["click", 10], ["click", 21], ["click", 24]]);
});

test("model selection returns the updated selector after a stale snapshot", async () => {
  const { wb, state } = existingTask();
  await wb.open();
  const menu = await wb.click(31);
  const item = menu.controls.find(({ label }) => label === "mimo-v2.6-pro");
  assert.ok(item);
  const selected = await wb.click(item.id);
  assert.ok(selected.controls.some(({ label }) => label === "Select model: mimo-v2.6-pro"));
  assert.deepEqual(state.actions, [["click", 31], ["click", 33]]);
});

test("geometric fallback clicks the point in the observed screenshot", async () => {
  const { wb, state } = existingTask({ mode: "point" });
  await wb.open();
  await wb.observe({ screenshot: true });
  const menu = await wb.click(20, { point: { x: 500, y: 400 } });
  assert.ok(menu.controls.some(({ label }) => label === "报告"));
  assert.deepEqual(state.actions.filter(([kind]) => kind === "point"),
    [["point", "screenshot-1", 500, 400]]);
});
