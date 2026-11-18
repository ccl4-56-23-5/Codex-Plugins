# Codex ↔ WorkBuddy

WorkBuddy Control 让 Codex 在 Windows 上新建 WorkBuddy 任务、发送草稿、读取当前可见的回复和停止生成。插件安装在 Codex。

## 安装

1. 准备 Windows 版 Codex Desktop，安装 WorkBuddy 并登录。在 PowerShell 确认 `codex --version` 和 `node --version` 可运行。要求 Node.js 22 或更新版本。
2. 从 [WorkBuddy Control 1.0.3+4](https://github.com/ccl4-56-23-5/CodexBridge/releases/tag/codex-workbuddy-control-v1.0.3%2B4) 下载并解压 `codex-workbuddy-control-1.0.3+4-Windows.zip`。
3. 在解压目录打开 PowerShell，执行安装脚本。

   ```powershell
   .\Install.ps1
   ```

4. 首次切换时从托盘退出普通启动的 WorkBuddy。
5. 在 Codex 新开聊天，选择 **WorkBuddy Control**。例如输入“让 WorkBuddy 新建任务，只回复 OK，完成后告诉我回复”。

用 `codex plugin list --marketplace workbuddy-tools --json` 检查版本和启用状态。插件通过本机 MCP 和 Electron 进程管道操作 WorkBuddy 5.11.3，无需 Computer Use。

[源码与维护说明](codex-workbuddy-control/1.0.3+4/README.md)
