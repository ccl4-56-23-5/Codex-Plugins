import { spawn, execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { join, dirname, win32 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createCdpClient } from "./cdp.mjs";
import { createWorkbench } from "./dom.mjs";

const execFileAsync = promisify(execFile);
const startWaitMs = 30000;

function systemTool(name) {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", name);
}

async function resolveWorkBuddy(executablePath) {
  if (process.platform !== "win32") throw new Error("WorkBuddy Control 目前支持 Windows。");
  if (executablePath == null) {
    try {
      const { stdout } = await execFileAsync(systemTool("reg.exe"), [
        "query", "HKCR\\workbuddy\\shell\\open\\command", "/ve",
      ], { windowsHide: true, timeout: 4000 });
      executablePath = stdout.match(/REG_(?:EXPAND_)?SZ\s+"([^"\r\n]+\\WorkBuddy\.exe)"/i)?.[1];
    } catch (error) {
      throw new Error("未能从 Windows 协议登记找到 WorkBuddy，请提供 WorkBuddy.exe 的完整路径。", { cause: error });
    }
  }
  if (typeof executablePath !== "string" || !/^(?:[a-z]:[\\/]|\\\\)/i.test(executablePath) ||
      !/^WorkBuddy\.exe$/i.test(win32.basename(executablePath))) {
    throw new Error("请提供已安装 WorkBuddy.exe 的完整路径。");
  }
  const resolved = await realpath(executablePath);
  if (!/^WorkBuddy\.exe$/i.test(win32.basename(resolved)) || !(await stat(resolved)).isFile()) {
    throw new Error("无法确认已安装 WorkBuddy.exe 的位置。");
  }
  return resolved;
}

async function isWorkBuddyRunning() {
  const { stdout } = await execFileAsync(systemTool("tasklist.exe"), [
    "/FI", "IMAGENAME eq WorkBuddy.exe", "/FO", "CSV", "/NH",
  ], { windowsHide: true, timeout: 5000 });
  return /^"WorkBuddy\.exe",/im.test(stdout);
}

function createDesktop(executable, onExit) {
  const child = spawn(executable, ["--remote-debugging-pipe"], {
    cwd: dirname(executable),
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
  });
  const expectedPath = pathToFileURL(join(dirname(executable), "resources", "app.asar", "renderer", "index.html"))
    .pathname.toLowerCase();
  const belongsToWorkbench = (url) => {
    try {
      const candidate = new URL(url);
      return candidate.protocol === "file:" && candidate.pathname.toLowerCase() === expectedPath;
    } catch {
      return false;
    }
  };
  const cdp = createCdpClient(child.stdio[3], child.stdio[4]);
  let exited = false;
  const attached = new Map();
  let board;

  const disconnect = (reason) => {
    if (exited) return;
    exited = true;
    cdp.dispose(reason);
    onExit();
  };
  child.once("error", disconnect);
  child.once("exit", () => disconnect("WorkBuddy 已退出。"));

  function workbenchFor(sessionId) {
    return createWorkbench((fn, ...args) => {
      const expression = `(() => {
        if (location.protocol !== "file:" || location.pathname.toLowerCase() !== ${JSON.stringify(expectedPath)}) {
          throw Error("WorkBuddy window changed");
        }
        return (${fn})(...${JSON.stringify(args)});
      })()`;
      return cdp.evaluate(sessionId, expression);
    });
  }

  async function findWorkbench() {
    const { targetInfos } = await cdp.request("Target.getTargets");
    const candidates = targetInfos.filter((target) => target.type === "page" && belongsToWorkbench(target.url));
    const candidateIds = new Set(candidates.map(({ targetId }) => targetId));
    for (const [targetId, { sessionId }] of attached) {
      if (candidateIds.has(targetId)) continue;
      attached.delete(targetId);
      await cdp.request("Target.detachFromTarget", { sessionId }).catch(() => {});
    }
    const ready = [];
    board = undefined;
    for (const { targetId } of candidates) {
      let session = attached.get(targetId);
      try {
        if (!session) {
          const sessionId = await cdp.attach(targetId);
          session = { sessionId, workbench: workbenchFor(sessionId) };
          attached.set(targetId, session);
        }
        const observation = await session.workbench.observe();
        if (observation.readable) ready.push({ ...session, observation });
      } catch (error) {
        if (exited) throw error;
        attached.delete(targetId);
        if (session) await cdp.request("Target.detachFromTarget", { sessionId: session.sessionId }).catch(() => {});
      }
    }
    if (ready.length > 1) throw new Error("发现多个 WorkBuddy 任务工作台。请关闭多余的窗口再重试。");
    board = ready[0]?.workbench;
    return ready[0]?.observation;
  }

  return {
    get exited() { return exited; },
    get board() { return board; },
    async open() {
      const deadline = Date.now() + startWaitMs;
      while (!exited && Date.now() < deadline) {
        const observation = await findWorkbench();
        if (observation) return observation;
        await delay(450);
      }
      if (exited) throw new Error("WorkBuddy 在工作台就绪前退出。");
      throw new Error("WorkBuddy 已启动，任务工作台尚未就绪。请检查客户端的登录或启动界面，再调用 open()。");
    },
  };
}

export function createDesktopHost(onExit = () => {}) {
  let desktop;
  return async (method, args) => {
    if (method === "open") {
      if (!desktop || desktop.exited) {
        if (await isWorkBuddyRunning()) {
          throw new Error("WorkBuddy 当前由普通快捷方式或另一个进程启动。请先从系统托盘退出 WorkBuddy，再调用 open()。");
        }
        desktop = createDesktop(await resolveWorkBuddy(args.executablePath), onExit);
      }
      return desktop.open();
    }
    if (!desktop?.board || desktop.exited) throw new Error("请先调用 open() 连接 WorkBuddy 的任务工作台。");
    const board = desktop.board;
    switch (method) {
      case "observe": return board.observe();
      case "newTask": return board.newTask();
      case "prefillNew": {
        if (typeof args.text !== "string" || !args.text.trim()) throw new Error("草稿不能为空。");
        const state = await board.newTask();
        if (state.transition !== "confirmed") return state;
        return board.draft(args.text);
      }
      case "draft": return board.draft(args.text);
      case "send": return board.send(args.expectedDraft);
      case "stop": return board.stop();
      case "clearDraft": return board.clearDraft(args.expectedDraft);
      case "click": return board.click(args.id);
      default: throw new Error("未知的 WorkBuddy 操作。");
    }
  };
}
