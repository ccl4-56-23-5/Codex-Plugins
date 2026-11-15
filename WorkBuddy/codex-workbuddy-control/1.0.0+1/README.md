# WorkBuddy Control 1.0.0+1

在 Codex Desktop 中操作已登录的 Windows 版 WorkBuddy。可以选择任务、预填和提交新任务、查看当前可见回复、停止生成。WorkBuddy 使用原有模型与任务权限。

## 安装

解压 Windows ZIP，在 PowerShell 进入解压目录并运行 `.\Install.ps1`。安装脚本用 Codex CLI 注册本地市场并启用插件。依赖 Codex Desktop 的 Windows Computer Use 和 Node REPL，以及本机已安装、已登录的 WorkBuddy。用 `codex plugin list --marketplace workbuddy-tools --json` 查看安装结果。

在新的 Codex 聊天中选择 **WorkBuddy Control**，例如输入“在 WorkBuddy 新建任务，只回复 OK，完成后告诉我回复”。也可以让插件打开已有任务并查看当前可见内容，或停止正在生成的任务。

## 当前兼容性

本机实测 WorkBuddy 5.11.3 中文界面。部分页面的输入框只回报窗口焦点。在已有会话遇到这种情况时，需要在 WorkBuddy 输入草稿，再由 Codex 核对并发送。答复读取范围取决于 WorkBuddy 对无障碍树暴露的可见内容。新任务预填走 WorkBuddy 本机任务链接，按编码后 6,000 字符限制。任务文字出现在本机应用启动参数中。

卸载可运行 `codex plugin remove codex-workbuddy-control@workbuddy-tools`，并用 `codex plugin marketplace remove workbuddy-tools`移除本地市场登记。维护信息见 [维护文档](维护文档.md)。
