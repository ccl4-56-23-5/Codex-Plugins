const REFRESH_MS = 160;
const TRANSITION_MS = 3500;

// Each call runs in the selected WorkBuddy page. Keep all dependencies in this
// function so the transport can serialize it without exposing an eval tool.
async function workbenchPage(action, args = {}) {
  const visible = (element) => element && element.getClientRects().length > 0 &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    getComputedStyle(element).visibility === "visible";
  const find = (root, selector) => Array.from(root?.querySelectorAll(selector) ?? []).filter(visible);
  const only = (items) => items.length === 1 ? items[0] : null;
  const enabled = (element) => Boolean(element && !element.matches(':disabled, [aria-disabled="true"]'));
  const selected = (element) => Boolean(element?.matches(
    '[aria-selected="true"], [aria-checked="true"], [data-selected="true"]'));
  const clean = (text) => text.replace(/\r\n?/g, "\n");
  const redact = (text) => text.replace(/file:\/\/\/[^\s)]+/gi, "[本地页面]")
    .replace(/(\bwbSeedToken=)[^&#\s)]+/gi, "$1[已隐藏]");
  const label = (element) => (element.getAttribute("aria-label") || element.innerText || "")
    .replace(/\s+/g, " ").trim();
  const fail = (error) => ({ error });

  const localRoute = () => location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname;
  const route = localRoute();
  const routedTask = /^\/(?:task|conversation)\/([A-Za-z0-9._~-]+)(?:[/?#]|$)/.exec(route)?.[1];
  const sidebarNewTask = only(find(document,
    'button[role="tab"][data-track-id="agent_new_task_button_clicked"]'));
  const newTask = sidebarNewTask ??
    only(find(document, '[data-testid="titlebar-row"] button[data-track-id="agent_new_task_button_clicked"]'));
  const taskCards = find(document, '[data-view-id="sidebar"] .cb-agent-card[data-conversation-id]');
  const selectedTask = only(taskCards.filter(selected));
  const newTaskSelected = selected(sidebarNewTask);

  // The workbench uses a display:contents frame on some window layouts.
  const main = only([...document.querySelectorAll('.layout-window-frame__body[data-view-id="main-content"]')]);
  const legacy = find(main ?? document, ".chat-container:not(.chat-container--share-mode)");
  const composerHostSelector = '.cr-input-editor-host [data-slate-editor="true"][contenteditable]:not([contenteditable="false"])';
  const mainEditor = only(find(main, composerHostSelector));
  const ordinaryMain = main && newTask && mainEditor;
  const chat = only(legacy) ?? (legacy.length === 0 && ordinaryMain ? main : null);
  const welcome = chat?.classList.contains("chat-container--welcome") ||
    Boolean(chat === main && main && !selectedTask && !routedTask &&
      (newTaskSelected || /^WorkBuddy[,，]\s*我帮你(?:\s|$)/i.test(main.innerText ?? "")));
  const editor = chat && (chat === main ? mainEditor :
    only(find(chat, '[data-slate-editor="true"][contenteditable="true"]')
      .filter((element) => !element.closest("[data-user-message-id]"))));
  const button = only(find(chat,
    'button.cr-send-button, button[data-track-id="agent_session_input_status"], button[data-track-id="agent_task_interrupted"]')
    .filter((element) => !element.closest("[data-user-message-id]")));
  const buttonLabel = button?.getAttribute("aria-label") ?? "";
  const sendButton = button?.matches('[data-track-id="agent_session_input_status"]') ||
    /^(发送|Send)$/i.test(buttonLabel);
  const stopButton = button?.matches('.cr-send-button--stop, [data-track-id="agent_task_interrupted"]') ||
    /^(停止|停止生成|Stop|Stop generating)$/i.test(buttonLabel);
  const sendEnabled = enabled(button) && Boolean(sendButton && !stopButton);
  const canStop = enabled(button) && Boolean(stopButton);
  const hasAttachment = Boolean(editor?.querySelector("[data-contentblock], [data-slate-void]"));

  function readDraft() {
    if (!editor) return "";
    return clean(Array.from(editor.children, (child) =>
      Array.from(child.querySelectorAll("[data-slate-string]"), (part) => part.textContent ?? "")
        .join("")).join("\n"));
  }

  const messageNodes = find(chat,
    ".cr-self-message[data-user-message-id], .cr-agent[data-message-id]").slice(-80);
  const messages = [];
  for (const element of messageNodes) {
    const user = element.classList.contains("cr-self-message");
    const messageId = user ? element.dataset.userMessageId : element.dataset.messageId;
    const body = only(find(element, user
      ? ".cr-self-bubble:not(.cr-self-bubble--editing)"
      : "[data-assistant-content]"));
    if (!messageId || !body) continue;
    messages.push({
      id: messageId,
      role: user ? "user" : "assistant",
      text: clean(body.innerText ?? "").trim().slice(0, 12000),
      ...(user ? { notSent: Boolean(element.querySelector(".cr-self-message__not-sent")) } : {
        userMessageId: element.dataset.userMessageId ?? null,
        processing: element.dataset.messageProcessing === "true",
      }),
    });
  }

  const taskId = welcome || !chat ? null : routedTask ?? selectedTask?.dataset.conversationId ?? null;
  const recentUser = messages.findLast((message) => message.role === "user")?.id ?? "";
  const scope = chat ? (welcome ? "welcome" : taskId ? "task/" + taskId : "workbench/" + recentUser) :
    newTask && legacy.length === 0 ? "navigation" : null;
  const draft = readDraft();
  const running = canStop || messages.some((message) => message.processing);
  const controls = [];
  const addControls = (kind, elements) => {
    for (const element of elements) {
      const name = label(element);
      if (name) controls.push({
        element,
        kind,
        label: name,
        task: kind === "task" ? element.dataset.conversationId : null,
        enabled: enabled(element),
        selected: selected(element),
      });
    }
  };
  if (newTask) addControls("newTask", [newTask]);
  addControls("task", taskCards);
  addControls("model", find(chat, "button.cr-model-selector__trigger"));
  addControls("modelOption", find(document,
    '.cr-model-selector__popover .cr-model-selector__item[role="option"]'));
  addControls("group", find(chat, "button.cr-workspace-picker, button.cr-workspace-picker__main-trigger"));
  addControls("groupOption", find(document,
    '.cr-workspace-picker-dropdown .cr-workspace-picker-popover__item'));

  const describeControl = ({ element, ...descriptor }) => descriptor;
  const snapshot = () => ({
    readable: Boolean(scope),
    taskId,
    scope,
    welcome,
    running,
    composer: editor ? { draft: redact(draft), hasAttachment, sendEnabled, canStop } :
      button ? { draft: "", hasAttachment: false, sendEnabled: false, canStop } : null,
    messages: messages.map((message) => ({ ...message, text: redact(message.text) })),
    visibleText: messages.map((message) => redact(message.text)).filter(Boolean).join("\n").slice(-20000),
    controls: controls.slice(0, 240).map(describeControl),
  });

  if (action === "observe") return snapshot();
  if (!scope || scope !== args.scope) return fail("WorkBuddy 当前任务已变化，请重新观察。");
  if (action === "newTask") {
    if (draft || hasAttachment) return fail("当前输入框有草稿或附件，请先处理。");
    if (welcome && !running) return { issued: false };
    if (!enabled(newTask)) return fail("当前界面没有唯一可操作的「新建任务」。");
    newTask.click();
    return { issued: true };
  }
  if (action === "draft") {
    if (!editor || draft || hasAttachment || running) return fail("需要处于空白且闲置的任务编辑框。");
    editor.focus({ preventScroll: true });
    if (document.activeElement !== editor || readDraft() || localRoute() !== route) {
      return fail("任务编辑框、焦点或草稿发生变化。");
    }
    // Slate handles a plain-text paste through its normal editor callback.
    // A synthetic DataTransfer does not read or modify the system clipboard.
    const data = new DataTransfer();
    data.setData("text/plain", args.text);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    return { issued: true };
  }
  if (action === "clearDraft") {
    if (!editor || draft !== args.text || hasAttachment) return fail("完整草稿已变化，未清空。");
    editor.focus({ preventScroll: true });
    const parts = Array.from(editor.querySelectorAll("[data-slate-string]"));
    const first = parts[0]?.firstChild;
    const end = parts.at(-1)?.firstChild;
    const selection = document.getSelection();
    if (!selection || first?.nodeType !== Node.TEXT_NODE || end?.nodeType !== Node.TEXT_NODE ||
        document.activeElement !== editor) {
      return fail("无法选中 WorkBuddy 编辑框里的草稿。");
    }
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(end, end.length);
    selection.removeAllRanges();
    selection.addRange(range);
    // Slate applies the real DOM selection through its selectionchange listener.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const selected = selection.rangeCount === 1 && selection.getRangeAt(0);
    if (!editor.isConnected || document.activeElement !== editor || localRoute() !== route ||
        !selected || selected.startContainer !== first || selected.startOffset !== 0 ||
        selected.endContainer !== end || selected.endOffset !== end.length ||
        readDraft() !== args.text || editor.querySelector("[data-contentblock], [data-slate-void]")) {
      return fail("未能核实只选中了完整草稿，未清空。");
    }
    editor.dispatchEvent(new ClipboardEvent("cut", {
      clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
    }));
    return { issued: true };
  }
  if (action === "send") {
    if (!editor || !sendEnabled || running || hasAttachment || draft !== args.text) {
      return fail("草稿、附件或发送状态已变化，未点击发送。");
    }
    button.click();
    return { issued: true };
  }
  if (action === "stop") {
    if (!canStop) return fail("当前任务没有可操作的停止按钮。");
    button.click();
    return { issued: true };
  }
  if (action === "click") {
    const descriptor = args.control;
    const control = only(controls.filter((candidate) =>
      candidate.kind === descriptor.kind && candidate.label === descriptor.label &&
      candidate.task === descriptor.task));
    if (!control?.enabled || descriptor.kind === "newTask") {
      return fail("控件不可用或发生变化，请重新观察。");
    }
    if (descriptor.kind === "task" && (draft || hasAttachment)) {
      return fail("当前输入框有草稿或附件，请先处理。");
    }
    control.element.click();
    return { issued: true };
  }
  return fail("WorkBuddy 界面操作不可用。");
}

function requiredText(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("请输入非空的完整提示文本。");
  return text.replace(/\r\n?/g, "\n");
}

export function createWorkbench(evaluate) {
  if (typeof evaluate !== "function") throw new TypeError("需要 WorkBuddy 页面连接。");
  let last;
  let nextId = 0;
  let pendingSend;

  async function execute(action, args) {
    const result = await evaluate(workbenchPage, action, args ?? {});
    if (result?.error) throw Object.assign(new Error(result.error), { code: "WORKBENCH_ACTION_REJECTED" });
    return result;
  }

  const sentMessage = (state, attempt) => (!attempt.taskId || state.taskId === attempt.taskId) &&
    state.messages.find((message) =>
    message.role === "user" && !message.notSent &&
    !attempt.messageIds.has(message.id) && message.text === attempt.text.trim());

  async function observe() {
    last = undefined;
    const state = await execute("observe");
    if (pendingSend && sentMessage(state, pendingSend)) pendingSend = undefined;
    const controls = state.controls.map((control) => ({ ...control, id: ++nextId }));
    last = { ...state, controls };
    return last;
  }

  async function waitFor(predicate, issued) {
    const deadline = Date.now() + TRANSITION_MS;
    for (;;) {
      const state = await observe();
      if (predicate(state)) return { ...state, issued, transition: "confirmed" };
      if (Date.now() >= deadline) return { ...state, issued, transition: "unconfirmed" };
      await new Promise((resolve) => setTimeout(resolve, REFRESH_MS));
    }
  }

  async function act(action, args = {}) {
    if (!last?.readable) throw new Error("请先观察 WorkBuddy 任务页面。");
    const { scope } = last;
    last = undefined;
    return execute(action, { ...args, scope });
  }

  return {
    observe,
    async newTask() {
      const { issued } = await act("newTask");
      return waitFor((state) => state.welcome && state.composer && !state.composer.draft && !state.running, issued);
    },
    async draft(text) {
      const expected = requiredText(text);
      const scope = last?.scope;
      const { issued } = await act("draft", { text: expected });
      return waitFor((state) => state.scope === scope && state.composer?.draft === expected &&
        state.composer.sendEnabled, issued);
    },
    async clearDraft(text) {
      const expected = requiredText(text);
      if (last?.composer?.draft !== expected) throw new Error("请先观察并核对要清空的完整草稿。");
      const { scope } = last;
      const { issued } = await act("clearDraft", { text: expected });
      return waitFor((state) => state.scope === scope && state.composer && !state.composer.draft &&
        !state.composer.hasAttachment && !state.composer.sendEnabled, issued);
    },
    async send(text) {
      const expected = requiredText(text);
      if (pendingSend) throw new Error("上一条消息的发送结果未确认，请检查任务中是否出现这条消息。");
      if (last?.composer?.draft !== expected || !last.composer.sendEnabled) {
        throw new Error("请先观察并核对要发送的完整草稿。");
      }
      const attempt = {
        text: expected,
        taskId: last.taskId,
        messageIds: new Set(last.messages.map(({ id }) => id)),
      };
      pendingSend = attempt;
      try {
        const { issued } = await act("send", { text: expected });
        return await waitFor((state) => Boolean(sentMessage(state, attempt)), issued);
      } catch (error) {
        if (error?.code === "WORKBENCH_ACTION_REJECTED") pendingSend = undefined;
        throw error;
      }
    },
    async stop() {
      const scope = last?.scope;
      const { issued } = await act("stop");
      return waitFor((state) => state.scope === scope && !state.running, issued);
    },
    async click(id, { until } = {}) {
      if (until != null && typeof until !== "function") throw new Error("until 必须是任务页状态判断函数。");
      const control = last?.controls.find((candidate) => candidate.id === id);
      if (!control) throw new Error("控件 ID 已失效，请重新观察。");
      if (until?.(last)) return { ...last, issued: false, transition: "confirmed" };
      if (control.kind === "newTask") {
        const { issued } = await act("newTask");
        return waitFor((state) => state.welcome && state.composer && !state.composer.draft && !state.running, issued);
      }
      const { issued } = await act("click", { control });
      if (typeof until === "function") return waitFor(until, issued);
      return { ...await observe(), issued, transition: "unconfirmed" };
    },
  };
}
