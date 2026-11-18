import { readFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { createWorkBuddy } from "./workbuddy.mjs";

const protocolVersion = "2025-11-25";
const supportedVersions = new Set([protocolVersion, "2025-06-18", "2025-03-26", "2024-11-05"]);
const maxRequestBytes = 256 * 1024;
const packageFile = new URL("../../.codex-plugin/plugin.json", import.meta.url);
const { name, version } = JSON.parse(await readFile(packageFile, "utf8"));
const workBuddy = createWorkBuddy();

function definition(name, description, parameter, annotations) {
  const properties = parameter === "id" ? { id: { type: "integer", minimum: 1 } } :
    parameter ? { [parameter]: { type: "string", minLength: 1 } } : {};
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
    annotations,
  };
}

const tools = [
  definition("open", "打开或重新连接 Windows 已登记的 WorkBuddy，并观察当前任务。", null,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
  definition("observe", "读取 WorkBuddy 的当前任务、可见消息和编辑区状态。", null,
    { readOnlyHint: true, openWorldHint: false }),
  definition("newTask", "在 WorkBuddy 中打开空白新任务。", null,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
  definition("prefillNew", "打开新任务并填入完整草稿，等待发送。", "text",
    { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
  definition("draft", "在当前任务的空编辑区填入完整草稿。", "text",
    { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
  definition("send", "发送用户已授权且与当前完整草稿一致的文本。结果不明时先观察任务并核对消息。", "expectedDraft",
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }),
  definition("stop", "在当前 WorkBuddy 任务中点击可用的停止控件。", null,
    { readOnlyHint: false, destructiveHint: true, openWorldHint: false }),
  definition("clearDraft", "清除与所给完整草稿一致的当前编辑内容。", "expectedDraft",
    { readOnlyHint: false, destructiveHint: true, openWorldHint: false }),
  definition("click", "点击最近一次 WorkBuddy 观察返回的导航控件 ID，并返回刷新后的任务状态。", "id",
    { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
];
const allowlist = new Map(tools.map(tool => [tool.name, tool]));

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failure(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function callTool(tool, args) {
  const fields = tool.inputSchema.required;
  if (!isObject(args) || Object.keys(args).length !== fields.length ||
      fields.some(field => !Object.hasOwn(args, field) || (field === "id"
        ? !Number.isSafeInteger(args[field]) || args[field] < 1
        : typeof args[field] !== "string" || !args[field].trim()))) {
    if (fields[0] === "id") return failure("请提供上次观察返回的整数控件 ID。");
    return failure(fields.length ? `请提供非空字符串参数 ${fields[0]}。` : "此操作无需参数。");
  }
  try {
    const value = await workBuddy[tool.name](...fields.map(field => args[field]));
    const result = { content: [{ type: "text", text: JSON.stringify(value ?? null) }], isError: false };
    if (isObject(value)) result.structuredContent = value;
    return result;
  } catch (error) {
    return failure(error instanceof Error ? error.message : "WorkBuddy 操作失败。");
  }
}

function write(id, response) {
  const line = JSON.stringify({ jsonrpc: "2.0", id, ...response }) + "\n";
  return new Promise((resolve, reject) => {
    stdout.write(line, error => error ? reject(error) : resolve());
  });
}

function protocolError(id, code, message) {
  return write(id, { error: { code, message } });
}

let initialized = false;
const input = createInterface({ input: stdin, crlfDelay: Infinity, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  if (Buffer.byteLength(line) > maxRequestBytes) {
    await protocolError(null, -32600, "Request exceeds the size limit");
    continue;
  }

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    await protocolError(null, -32700, "Parse error");
    continue;
  }

  const id = request?.id;
  const validId = typeof id === "string" || Number.isInteger(id);
  if (!isObject(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string" ||
      (Object.hasOwn(request, "id") && !validId)) {
    await protocolError(validId ? id : null, -32600, "Invalid request");
    continue;
  }

  // Notifications do not receive responses. WorkBuddy generation stops through the explicit stop tool.
  if (!validId) continue;
  const { method, params } = request;
  if (method === "initialize") {
    if (initialized || !isObject(params) || typeof params.protocolVersion !== "string") {
      await protocolError(id, -32602, "Invalid initialize request");
      continue;
    }
    initialized = true;
    await write(id, { result: {
      protocolVersion: supportedVersions.has(params.protocolVersion) ? params.protocolVersion : protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name, version },
    } });
  } else if (method === "ping") {
    await write(id, { result: {} });
  } else if (!initialized) {
    await protocolError(id, -32002, "Server not initialized");
  } else if (method === "tools/list") {
    await write(id, { result: { tools } });
  } else if (method === "tools/call") {
    const tool = isObject(params) && allowlist.get(params.name);
    if (!tool) {
      await protocolError(id, -32602, "Unknown or missing tool name");
      continue;
    }
    const args = Object.hasOwn(params, "arguments") ? params.arguments : {};
    await write(id, { result: await callTool(tool, args) });
  } else {
    await protocolError(id, -32601, "Method not found");
  }
}
