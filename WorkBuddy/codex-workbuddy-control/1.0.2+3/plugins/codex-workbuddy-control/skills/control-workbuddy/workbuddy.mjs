import { spawn } from "node:child_process";
import { win32 } from "node:path";

const WORKBUDDY_APP = "WorkBuddy.exe";
const MAIN_TITLE = /^WorkBuddy$/i;
const SEND = /^(发送|Send)$/i;
const STOP = /^(停止|停止生成|Stop|Stop generating)$/i;
const GROUP_OR_MODEL = /^(选择分组|Select group|Choose group|Select model\s*:.*)$/i;
const WAIT_MS = 3200;
const REFRESH_MS = 180;
const STARTUP_ATTEMPTS = 20;
const STARTUP_POLL_MS = 500;
const CONTROL_ROLES = new Set([
  "button", "menu item", "tab item", "check box", "radio button",
  "combo box", "list item", "tree item", "hyperlink",
]);
const PLACEHOLDERS = [
  /^今天帮你做些什么？\s*@\s*添加上下文[，,]\s*\/\s*调用技能与指令$/,
  /^What can I (?:help you with|do for you) today\?/i,
];

function redact(text) {
  return text.replace(/file:\/\/\/[^\s)]+/gi, "[本地页面]")
    .replace(/([?&]wbSeedToken=)[^&#\s)]+/gi, "$1[已隐藏]");
}

function cleanDraft(text) {
  return text.replace(/\r\n?/g, "\n").replace(/^\uFEFF[\u200B ]?/, "").trim();
}

function parseLine(line) {
  const match = /^([\t ]*)(\d+) ([^(]+?) \([^)]+\)(.*)$/.exec(line);
  if (!match) return null;

  const [, indent, id, role, rest] = match;
  const flagPrefix = /^\s*((?:\((?:disabled|selectable|selected|settable, string|checked|unchecked|expanded|collapsed)\)\s*)*)/.exec(rest)[0];
  const flags = [...flagPrefix.matchAll(/\(([^)]+)\)/g)].map((flag) => flag[1]);
  const remaining = rest.slice(flagPrefix.length);
  const automationId = /(?:^|\s)ID: (\S+)\s*$/.exec(remaining)?.[1]?.replace(/\\:/g, ":");
  const body = remaining.replace(/(?:^|\s+)(?:Secondary Actions|ID): .*$/, "");
  const valueStart = body.search(/(?:^|\s)Value: /);
  const label = (valueStart < 0 ? body : body.slice(0, valueStart)).trim();
  const value = valueStart < 0 ? "" : body.slice(valueStart).trimStart().slice(7);
  return { id: Number(id), depth: indent.length, role, label, value, flags, automationId };
}

function parseTree(tree) {
  const nodes = [];
  for (const line of tree.split(/\r?\n/)) {
    if (/^(?:Document text|Focused element|Selected text|Selected elements):/.test(line)) break;
    const node = /^[\t ]/.test(line) ? parseLine(line) : null;
    if (node) {
      nodes.push(node);
    } else if (nodes.at(-1)?.role === "text field" && line.trim()) {
      nodes.at(-1).value += "\n" + line.trim();
    }
  }
  return nodes;
}

function findComposer(nodes) {
  const candidates = [];
  for (const [index, action] of nodes.entries()) {
    if (action.role !== "button" || !(SEND.test(action.label) || STOP.test(action.label))) continue;
    for (let i = index - 1; i >= 0 && nodes[i].depth >= action.depth; i--) {
      const editor = nodes[i];
      if (editor.depth !== action.depth || editor.role !== "text field" ||
          !editor.flags.some((flag) => /\bsettable\b/.test(flag))) continue;
      const stop = STOP.test(action.label) ? action : null;
      const send = stop ? null : action;
      const sendEnabled = !!send && !send.flags.includes("disabled");
      const value = cleanDraft(editor.value);
      const isPlaceholder = !sendEnabled && PLACEHOLDERS.some((pattern) => pattern.test(value));
      candidates.push({ editor, send, stop, sendEnabled, draft: isPlaceholder ? "" : value });
      break;
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function describe(state, nodes, composer) {
  const focus = parseLine(state.accessibility?.focused_element ?? "");
  const focused = composer != null && focus?.id === composer.editor.id &&
    focus.role === composer.editor.role;
  const controls = nodes
    .filter((node) => CONTROL_ROLES.has(node.role) && node.label)
    .slice(0, 300)
    .map(({ id, role, label, flags }) => ({
      id, role, label: redact(label).slice(0, 240), enabled: !flags.includes("disabled"),
      ...(flags.includes("selected") ? { selected: true } : {}),
    }));
  const visibleText = nodes.filter((node) => node.role === "text" && node.label)
    .map((node) => redact(node.label)).join("\n").slice(-20000);

  return {
    window: { id: state.window.id, title: state.window.title },
    readable: nodes.some((node) => node.role === "document"),
    controls,
    composer: composer && {
      focused, draft: redact(composer.draft), sendEnabled: composer.sendEnabled,
      canStop: !!composer.stop && !composer.stop.flags.includes("disabled"),
    },
    visibleText,
  };
}

function inside(nodes, parent, child) {
  const from = nodes.indexOf(parent);
  for (let i = from + 1; i < nodes.length && nodes[i].depth > parent.depth; i++) {
    if (nodes[i] === child) return true;
  }
  return false;
}

function accountMenu(observation) {
  const nodes = observation.nodes;
  // WorkBuddy pairs its trigger and menu using the same React-generated suffix.
  const trigger = nodes.find((node) => node.role === "menu item" &&
    node.automationId?.startsWith("wb-popover-trigger:") && nodes.some((menu) =>
      menu.role === "menu" && menu.automationId === node.automationId.replace("-trigger", "") &&
      nodes.some((item) => /^(点击复制用户 ID|Copy User ID|退出登录|Log out|Sign out)$/i.test(item.label) &&
        inside(nodes, menu, item))));
  if (!trigger) return null;
  return { trigger, menu: nodes.find((node) =>
    node.role === "menu" && node.automationId === trigger.automationId.replace("-trigger", "")) };
}

function uiKey(observation) {
  const { controls, composer } = observation.result;
  return JSON.stringify([
    composer && [composer.draft, composer.sendEnabled, composer.canStop],
    controls.map(({ role, label, enabled, selected }) =>
      [role, label.replace(/\s+\d+\s*(?:秒|分钟|小时|天)前$/, ""), enabled, selected]),
  ]);
}

function postedCount(observation, prompt) {
  const normalize = (value) => value.replace(/\s+/g, " ").trim();
  const expected = normalize(prompt);
  return observation.nodes.filter((node) => (node.role === "text" || node.role === "group") &&
    normalize(node.label) === expected && !(observation.composer &&
      inside(observation.nodes, observation.composer.editor, node))).length;
}

async function findWindow(sky) {
  let discovered;
  try {
    discovered = await sky.list_windows();
  } catch (error) {
    throw new Error(`无法枚举 WorkBuddy 主窗口（${error.message}）。`, { cause: error });
  }
  const windows = discovered.filter(({ app, title }) =>
    /(?:^|[\\/:])WorkBuddy\.exe$/i.test(app) && MAIN_TITLE.test(title));
  if (windows.length > 1) throw new Error("发现多个 WorkBuddy 主窗口，请先确定要操作的窗口。");
  return windows[0];
}

async function launchWorkBuddy(sky, executablePath) {
  let app = executablePath;
  if (!app) {
    const apps = (await sky.list_apps()).filter(({ displayName }) => MAIN_TITLE.test(displayName));
    if (apps.length > 1) throw new Error("发现多个 WorkBuddy 安装，请先打开要操作的客户端。");
    app = apps[0]?.id ?? WORKBUDDY_APP;
  }
  try {
    await sky.launch_app({ app });
  } catch (error) {
    const instruction = /app approval timed out/i.test(error.message)
      ? "等待 Codex 应用审批超时。请解锁 Windows，查看 Codex 中的 WorkBuddy 授权请求并处理，再调用 open()。"
      : "WorkBuddy 启动未确认。请检查 Codex 的应用审批与 WorkBuddy 安装，再调用 open()。";
    throw new Error(`${instruction}（${error.message}）`, { cause: error });
  }
}

async function activateWorkBuddy(sky, candidate) {
  for (let attempt = 0; ; attempt++) {
    try {
      const target = await sky.get_window({ id: candidate.id, app: candidate.app });
      await sky.activate_window({ window: target });
      return target;
    } catch (error) {
      if (!attempt && /failed to activate captured window/i.test(error.message)) {
        candidate = await findWindow(sky);
        if (candidate) continue;
      }
      throw new Error(
        `无法接管 WorkBuddy 主窗口。请确认 Windows 已解锁，从任务栏将 WorkBuddy 切到前台并确认客户端已就绪，再调用 open()。（${error.message}）`,
        { cause: error },
      );
    }
  }
}

function launchTaskLink(executable, uri) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [uri], {
      shell: false, stdio: "ignore", windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function createWorkBuddy(sky, launch = launchTaskLink) {
  let window;
  let last;
  let visualFocus;

  async function observe({ screenshot = false } = {}) {
    visualFocus = undefined;
    if (!window) throw new Error("请先调用 open()。");
    last = undefined;
    const state = await sky.get_window_state({
      window, include_screenshot: screenshot, include_text: true,
    });
    window = state.window;
    const nodes = parseTree(state.accessibility?.tree ?? "");
    const composer = findComposer(nodes);
    const result = describe(state, nodes, composer);
    last = { state, nodes, composer, result };
    return result;
  }

  async function waitFor(predicate, { screenshot = false, timeout = WAIT_MS } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const result = await observe();
      const confirmed = predicate(last);
      if (confirmed || Date.now() >= deadline) {
        const final = screenshot ? await observe({ screenshot: true }) : result;
        return { ...final, transition: confirmed ? "confirmed" : "unconfirmed" };
      }
      await new Promise((resolve) => setTimeout(resolve, REFRESH_MS));
    }
  }

  async function clickNode(node, point) {
    if (!node || !last || node.flags.includes("disabled")) {
      throw new Error("控件当前不可操作，请刷新后重新选择。");
    }
    const target = last.state.window;
    let args = { window: target, element_index: node.id };
    if (point) {
      const shots = last.state.screenshots;
      const screenshotId = point.screenshotId ?? (shots?.length === 1 ? shots[0].id : undefined);
      if (!shots?.some((shot) => shot.id === screenshotId) ||
          !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error("坐标必须来自刚观察的 WorkBuddy 截图。");
      }
      args = { window: target, screenshotId, x: point.x, y: point.y };
    }
    last = undefined;
    visualFocus = undefined;
    try {
      await sky.click(args);
    } catch (error) {
      if (/coordinate input geometry is unavailable/i.test(error.message)) {
        throw new Error("当前控件的点击位置不可用。请刷新截图，检查遮挡后使用对应控件的可见位置。", { cause: error });
      }
      throw error;
    }
  }

  return {
    async open({ executablePath } = {}) {
      last = undefined;
      visualFocus = undefined;
      window = undefined;
      if (executablePath !== undefined &&
          (typeof executablePath !== "string" || !/^(?:[a-z]:[\\/]|\\\\)/i.test(executablePath) ||
          !/^WorkBuddy\.exe$/i.test(win32.basename(executablePath)))) {
        throw new Error("请提供已安装 WorkBuddy.exe 的完整路径。");
      }
      let candidate = await findWindow(sky);
      if (!candidate) {
        await launchWorkBuddy(sky, executablePath);
        for (let attempt = 0; !candidate && attempt < STARTUP_ATTEMPTS; attempt++) {
          candidate = await findWindow(sky);
          if (!candidate) await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_MS));
        }
      }
      if (!candidate) {
        throw new Error("启动请求已返回，但未发现 WorkBuddy 主窗口。请检查任务栏、托盘或启动对话框，再调用 open()。");
      }

      window = await activateWorkBuddy(sky, candidate);
      try {
        await waitFor(({ result }) => result.readable);
        if (last.result.readable) return last.result;
        throw new Error("主窗口尚未提供可读的 WorkBuddy 界面");
      } catch (error) {
        window = undefined;
        last = undefined;
        throw new Error(
          `无法读取 WorkBuddy。请确认客户端已加载、登录，且启动对话框已处理，再调用 open()。（${error.message}）`,
          { cause: error },
        );
      }
    },
    observe,
    async prefillNew(text) {
      if (typeof text !== "string" || !cleanDraft(text)) throw new Error("草稿不能为空。");
      if (!last?.result.readable) throw new Error("请先打开并观察 WorkBuddy。");
      await observe();
      if (last.composer?.draft || last.composer?.sendEnabled) {
        throw new Error("当前输入框存在草稿，请先处理。");
      }
      const executable = last.state.window.app.replace(/^process:/i, "");
      if (!win32.isAbsolute(executable) || !/^WorkBuddy\.exe$/i.test(win32.basename(executable))) {
        throw new Error("无法确认 WorkBuddy 主程序路径。");
      }
      const query = new URLSearchParams({ action: "start", prompt: cleanDraft(text) });
      const uri = "workbuddy://task?" + query;
      if (uri.length > 6000) throw new Error("草稿超出 WorkBuddy 桌面任务链接长度。");
      last = undefined;
      await launch(executable, uri);
      return waitFor((snapshot) => snapshot.composer?.draft === cleanDraft(text) &&
        snapshot.composer.sendEnabled);
    },
    async click(id, { until, point } = {}) {
      if (!Number.isInteger(id)) throw new Error("请提供上次观察返回的控件 ID。");
      if (until != null && typeof until !== "function") throw new Error("until 必须是界面状态判断函数。");
      let node = last?.nodes.find((entry) => entry.id === id);
      if (!node || !last.result.controls.some((control) => control.id === id)) {
        throw new Error("控件 ID 已失效，请刷新。");
      }
      if (SEND.test(node.label)) throw new Error("发送消息请用 send(expectedDraft)。");
      const overlay = accountMenu(last);
      if (overlay && GROUP_OR_MODEL.test(node.label) && !inside(last.nodes, overlay.menu, node)) {
        const { role, label, automationId } = node;
        await clickNode(overlay.trigger);
        const closed = await waitFor((snapshot) => !accountMenu(snapshot));
        if (closed.transition !== "confirmed" || point) {
          throw new Error("请刷新后确认账户菜单已收起，再选择分组或模型。");
        }
        const matches = last.nodes.filter((entry) => entry.role === role &&
          entry.label === label && (!automationId || entry.automationId === automationId));
        if (matches.length !== 1) throw new Error("收起账户菜单后无法唯一定位目标控件。");
        [node] = matches;
      }
      const before = uiKey(last);
      let previousChange;
      const condition = until ? (snapshot) => Boolean(until(snapshot.result)) : (snapshot) => {
        const after = uiKey(snapshot);
        const stableChange = after !== before && after === previousChange;
        previousChange = after;
        return stableChange;
      };
      if (until && condition(last)) return { ...last.result, transition: "confirmed" };
      await clickNode(node, point);
      return waitFor(condition);
    },
    async focusComposer({ point } = {}) {
      const original = last?.composer?.editor;
      await clickNode(original, point);
      const result = await observe();
      if (result.composer?.focused || last.composer?.editor.id !== original.id) return result;
      const visual = await observe({ screenshot: true });
      const focus = parseLine(last.state.accessibility?.focused_element ?? "");
      if (last.composer?.editor.id === original.id && focus?.role === "document" &&
          last.state.screenshots?.length) {
        visualFocus = last;
        visual.composer.visualFocusRequired = true;
      }
      return visual;
    },
    async draft(text, { visualFocus: caretConfirmed = false } = {}) {
      if (typeof text !== "string" || !cleanDraft(text)) throw new Error("草稿不能为空。");
      if (!last?.composer || last.composer.draft || last.composer.sendEnabled || last.composer.stop) {
        throw new Error("请先确认 WorkBuddy 输入框空白且没有生成中的任务。");
      }
      const previous = last.composer.editor.id;
      const previousFocus = parseLine(last.state.accessibility?.focused_element ?? "");
      const visuallyConfirmed = caretConfirmed && visualFocus === last;
      await observe();
      const focus = parseLine(last.state.accessibility?.focused_element ?? "");
      if (!last.composer || last.composer.editor.id !== previous || last.composer.draft ||
          last.composer.sendEnabled || last.composer.stop ||
          !(last.result.composer.focused || (visuallyConfirmed && focus?.role === "document" &&
            focus.id === previousFocus?.id))) {
        throw new Error("请先确认焦点位于空白的 WorkBuddy 输入框。");
      }
      const target = last.state.window;
      last = undefined;
      await sky.type_text({ window: target, text });
      const expected = cleanDraft(text);
      const drafted = (snapshot) => snapshot.composer?.draft === expected && snapshot.composer.sendEnabled;
      const result = await waitFor(drafted, { timeout: 900 });
      if (result.transition === "confirmed") return result;
      // Slate may leave its UIA tree stale until a real selection change.
      const newFocus = parseLine(last.state.accessibility?.focused_element ?? "");
      if (last.composer?.editor.id === previous && !last.composer.stop &&
          (!last.composer.draft || last.composer.draft === expected) &&
          (last.result.composer.focused || (visuallyConfirmed && newFocus?.role === "document" &&
            newFocus.id === focus.id))) {
        const currentWindow = last.state.window;
        last = undefined;
        await sky.press_key({ window: currentWindow, key: "Control_L+a" });
        return waitFor(drafted);
      }
      return result;
    },
    async clearDraft(expectedDraft, { visualFocus: caretConfirmed = false } = {}) {
      if (typeof expectedDraft !== "string" || !cleanDraft(expectedDraft)) {
        throw new Error("请提供要清空的完整草稿。");
      }
      const previous = last?.composer;
      const previousFocus = parseLine(last?.state.accessibility?.focused_element ?? "");
      const visuallyConfirmed = caretConfirmed && visualFocus === last && !!last;
      await observe();
      const current = last.composer;
      const expected = cleanDraft(expectedDraft);
      if (!previous || current?.editor.id !== previous.editor.id ||
          previous.draft !== expected || current.draft !== expected) {
        throw new Error("草稿或输入框发生变化，未清空。");
      }
      const focus = parseLine(last.state.accessibility?.focused_element ?? "");
      if (!(last.result.composer.focused || (visuallyConfirmed && focus?.role === "document" &&
          focus.id === previousFocus?.id))) {
        await clickNode(current.editor);
        await observe();
      }
      if (last.composer?.editor.id !== current.editor.id || last.composer.draft !== expected) {
        throw new Error("草稿或输入框发生变化，未清空。");
      }
      const selected = (snapshot) => snapshot.composer?.editor.id === current.editor.id &&
        snapshot.composer.draft === expected &&
        cleanDraft(snapshot.state.accessibility?.selected_text ?? "") === expected;
      const selectingWindow = last.state.window;
      last = undefined;
      await sky.press_key({ window: selectingWindow, key: "Control_L+a" });
      const selection = await waitFor(selected, { timeout: 900 });
      if (selection.transition !== "confirmed") {
        throw new Error("无法核实只选中了完整草稿，未清空。");
      }
      const target = last.state.window;
      last = undefined;
      await sky.press_key({ window: target, key: "BackSpace" });
      return waitFor((snapshot) => snapshot.composer?.editor.id === current.editor.id &&
        !snapshot.composer.draft && !snapshot.composer.sendEnabled);
    },
    async send(expectedDraft) {
      if (typeof expectedDraft !== "string" || !cleanDraft(expectedDraft)) {
        throw new Error("请提供要发送的完整草稿。");
      }
      const previouslyObserved = last?.composer;
      if (!previouslyObserved) throw new Error("发送前请先观察草稿。");
      await observe();
      const current = last.composer;
      const expected = cleanDraft(expectedDraft);
      if (!current?.sendEnabled || current.editor.id !== previouslyObserved.editor.id ||
          current.draft !== expected || previouslyObserved.draft !== expected) {
        throw new Error("当前草稿、输入框或发送状态发生变化，未发送。");
      }
      const before = postedCount(last, expected);
      const alreadyRunning = /(?:^|\n)(?:生成回复中|正在生成|Generating response)(?:[.… ]|$)/i.test(last.result.visibleText);
      await clickNode(current.send);
      return waitFor((snapshot) => !!snapshot.composer && !snapshot.composer.draft &&
        (postedCount(snapshot, expected) > before || (!alreadyRunning && snapshot.result.composer.canStop)));
    },
    async stop() {
      if (!last) throw new Error("请先观察当前任务。");
      await observe();
      if (last.composer?.draft) throw new Error("草稿可能挡住停止按钮，请先核对并清空草稿。");
      const stop = last.composer?.stop;
      if (!stop) throw new Error("当前任务没有可见的停止按钮。");
      await clickNode(stop);
      return waitFor((snapshot) => !!snapshot.composer && !snapshot.result.composer.canStop);
    },
  };
}
