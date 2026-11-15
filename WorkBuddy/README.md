# Codex ↔ WorkBuddy

WorkBuddy Control 让 Codex 在 Windows 上新建 WorkBuddy 任务、发送草稿、读取当前可见的回复和停止生成。插件安装在 Codex。

## 安装

1. 准备 Windows 版 Codex Desktop，启用 Computer Use。安装 WorkBuddy 并登录；在 PowerShell 确认 `codex --version` 可运行。
2. 从 [WorkBuddy Control 1.0.0+1](https://github.com/ccl4-56-23-5/CodexBridge/releases/tag/codex-workbuddy-control-v1.0.0%2B1) 下载并解压 `codex-workbuddy-control-1.0.0+1-Windows.zip`。
3. 在解压目录打开 PowerShell，执行安装脚本。

   ```powershell
   .\Install.ps1
   ```

4. 在 Codex 新开聊天，选择 **WorkBuddy Control**。例如输入“让 WorkBuddy 新建任务，只回复 OK，完成后告诉我回复”。

用 `codex plugin list --marketplace workbuddy-tools --json` 检查版本和启用状态。WorkBuddy 5.11.3 的已有会话输入框可能无法确认编辑焦点，续发时可先在 WorkBuddy 填好草稿，再让 Codex 核对和发送。

[源码与维护说明](codex-workbuddy-control/1.0.0+1/README.md)
