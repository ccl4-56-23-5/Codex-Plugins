import { fileURLToPath } from "node:url";
import { createIpcClient } from "./ipc.mjs";

// The broker owns the Electron pipes and can survive multiple Codex chats.
export function createWorkBuddy() {
  const client = createIpcClient(fileURLToPath(new URL("./broker.mjs", import.meta.url)));
  return {
    open: ({ executablePath } = {}) => client.call("open", { executablePath }, { start: true }),
    observe: () => client.call("observe"),
    newTask: () => client.call("newTask"),
    prefillNew: (text) => client.call("prefillNew", { text }),
    draft: (text) => client.call("draft", { text }),
    send: (expectedDraft) => client.call("send", { expectedDraft }),
    stop: () => client.call("stop"),
    clearDraft: (expectedDraft) => client.call("clearDraft", { expectedDraft }),
    click: (id) => client.call("click", { id }),
  };
}
