import { createWorkBuddy } from "./workbuddy.mjs";

const args = process.argv.slice(2);
const methods = new Map([
  ["open", null], ["observe", null], ["newTask", null],
  ["prefillNew", "text"], ["draft", "text"], ["send", "expectedDraft"],
  ["stop", null], ["clearDraft", "expectedDraft"], ["click", "id"],
]);

async function readRequest() {
  if (args.length === 1) return { method: args[0] };
  if (args.length !== 0) throw new Error("请通过标准输入提供 JSON 参数。");
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 128_000) throw new Error("请求过长。");
  }
  return JSON.parse(input);
}

try {
  const { method, ...params } = await readRequest();
  if (!methods.has(method)) throw new Error("未知的 WorkBuddy 操作。");
  const wb = createWorkBuddy();
  const argument = methods.get(method);
  let result;
  if (method === "open") {
    result = await wb.open({ executablePath: params.executablePath });
  } else {
    result = argument ? await wb[method](params[argument]) : await wb[method]();
  }
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  process.stderr.write(String(error?.message ?? error) + "\n");
  process.exitCode = 1;
}
