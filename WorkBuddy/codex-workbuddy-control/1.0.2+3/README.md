# WorkBuddy Control 1.0.2+3

在 Codex Desktop 中操作已登录的 Windows 版 WorkBuddy。可以选择任务、预填和提交新任务、查看当前可见回复、停止生成。WorkBuddy 使用原有模型与任务权限。

## 安装

解压 Windows ZIP，在 PowerShell 进入解压目录并运行 `.\Install.ps1`。安装脚本用 Codex CLI 注册本地市场并启用插件。依赖 Codex Desktop 的 Windows Computer Use 和 Node REPL，以及本机已安装、已登录的 WorkBuddy。用 `codex plugin list --marketplace workbuddy-tools --json` 查看安装结果。

在新的 Codex 聊天中选择 **WorkBuddy Control**，例如输入“在 WorkBuddy 新建任务，只回复 OK，完成后告诉我回复”。也可以让插件打开已有任务并查看当前可见内容，或停止正在生成的任务。

## 当前兼容性

首次启动可能需要在 Codex 中审批 WorkBuddy 应用访问。等待审批超时后，先处理审批，再让插件重新检查主窗口。若提示无法接管窗口，请解锁 Windows，并从任务栏把 WorkBuddy 切到前台。WorkBuddy 未出现在应用列表且已知安装路径时，可以提供 `WorkBuddy.exe` 的完整路径。

兼容 WorkBuddy 5.11.3 中文界面。已有会话可续写；当客户端只报告文档焦点时，Codex 会检查截图中编辑框的光标，再通过正常键入填写草稿。插件也可以在核对草稿后清空编辑框，恢复被草稿挡住的停止按钮。发送、模型和分组操作按界面变化确认结果。

回复读取范围取决于客户端暴露的可见内容。新任务预填走 WorkBuddy 本机任务链接，按编码后 6,000 字符限制；任务文字会出现在本机应用启动参数中。覆盖升级时运行新版安装脚本，再开一个 Codex 聊天读取新版技能。

卸载可运行 `codex plugin remove codex-workbuddy-control@workbuddy-tools`，并用 `codex plugin marketplace remove workbuddy-tools`移除本地市场登记。维护信息见 [维护文档](维护文档.md)。
