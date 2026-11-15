import { spawn } from "node:child_process";
import { win32 } from "node:path";

const WORKBUDDY_APP = "WorkBuddy.exe";
const MAIN_TITLE = /^WorkBuddy$/i;
const SEND = /^(发送|Send)$/i;
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
  const valueStart = remaining.search(/(?:^|\s)Value: /);
  const label = (valueStart < 0 ? remaining : remaining.slice(0, valueStart))
    .replace(/\s+(?:Secondary Actions|ID): .*$/, "").trim();
  const value = valueStart < 0 ? "" : remaining.slice(valueStart).trimStart().slice(7)
    .replace(/\s+(?:Secondary Actions|ID): .*$/, "");
  return { id: Number(id), depth: indent.length, role, label, value, flags };
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
  const sends = nodes.filter((node) => node.role === "button" && SEND.test(node.label));
  if (sends.length !== 1) return null;

  const [send] = sends;
  let editor;
  for (let index = nodes.indexOf(send) - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node.depth < send.depth) break;
    if (node.depth === send.depth && node.role === "text field" &&
        node.flags.some((flag) => /\bsettable\b/.test(flag))) {
      editor = node;
      break;
    }
  }
  if (!editor) return null;

  const sendEnabled = !send.flags.includes("disabled");
  const value = cleanDraft(editor.value);
  const isPlaceholder = !sendEnabled && PLACEHOLDERS.some((pattern) => pattern.test(value));
  return { editor, send, sendEnabled, draft: isPlaceholder ? "" : value };
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
    }));
  const visibleText = nodes.filter((node) => node.role === "text" && node.label)
    .map((node) => redact(node.label)).join("\n").slice(-20000);

  return {
    window: { id: state.window.id, title: state.window.title },
    readable: nodes.some((node) => node.role === "document"),
    controls,
    composer: composer && {
      focused, draft: redact(composer.draft), sendEnabled: composer.sendEnabled,
    },
    visibleText,
  };
}

async function findWindow(sky) {
  const windows = (await sky.list_windows()).filter(({ app, title }) =>
    /(?:^|[\\/:])WorkBuddy\.exe$/i.test(app) && MAIN_TITLE.test(title));
  if (windows.length > 1) throw new Error("发现多个 WorkBuddy 主窗口，请先确定要操作的窗口。");
  return windows[0];
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

  async function observe({ screenshot = false } = {}) {
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

  async function clickNode(node) {
    if (!node || !last || node.flags.includes("disabled")) {
      throw new Error("控件当前不可操作，请刷新后重新选择。");
    }
    const target = last.state.window;
    last = undefined;
    await sky.click({ window: target, element_index: node.id });
    return observe();
  }

  return {
    async open() {
      last = undefined;
      let candidate = await findWindow(sky);
      if (!candidate) {
        const apps = (await sky.list_apps()).filter((app) => /^WorkBuddy$/i.test(app.displayName));
        if (apps.length > 1) throw new Error("发现多个 WorkBuddy 安装，请先打开要操作的客户端。");
        await sky.launch_app({ app: apps[0]?.id ?? WORKBUDDY_APP });
        for (let attempt = 0; !candidate && attempt < 20; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          candidate = await findWindow(sky);
        }
      }
      if (!candidate) throw new Error("未找到 WorkBuddy 主窗口。请打开已登录的 Windows 客户端。");

      window = await sky.get_window({ id: candidate.id, app: candidate.app });
      await sky.activate_window({ window });
      return observe();
    },
    observe,
    async prefillNew(text) {
      if (typeof text !== "string" || !cleanDraft(text)) throw new Error("草稿不能为空。");
      if (!last?.result.readable) throw new Error("请先打开并观察 WorkBuddy。");
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
      return observe();
    },
    async click(id) {
      if (!Number.isInteger(id)) throw new Error("请提供上次观察返回的控件 ID。");
      const node = last?.nodes.find((entry) => entry.id === id);
      if (!node || !last.result.controls.some((control) => control.id === id)) {
        throw new Error("控件 ID 已失效，请刷新。");
      }
      if (SEND.test(node.label)) throw new Error("发送消息请用 send(expectedDraft)。");
      return clickNode(node);
    },
    focusComposer() {
      return clickNode(last?.composer?.editor);
    },
    async draft(text) {
      if (typeof text !== "string" || !cleanDraft(text)) throw new Error("草稿不能为空。");
      if (!last?.result.composer?.focused || last.composer.draft || last.composer.sendEnabled) {
        throw new Error("请先确认焦点位于空白的 WorkBuddy 输入框。");
      }
      const target = last.state.window;
      last = undefined;
      await sky.type_text({ window: target, text });
      return observe();
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
      return clickNode(current.send);
    },
  };
}
