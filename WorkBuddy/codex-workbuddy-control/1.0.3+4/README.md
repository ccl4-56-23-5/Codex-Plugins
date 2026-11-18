# WorkBuddy Control 1.0.3+4

Codex 可以在 Windows 启动 WorkBuddy，选择任务，在新任务或已有任务里填写草稿、提交、读取回复及停止生成。插件通过 Electron 继承的进程管道读取任务界面和调用相应控件，无需 Computer Use 或调试 TCP 端口。

## 安装与使用

1. 解压 Windows ZIP，在 PowerShell 进入解压目录并运行 `.\Install.ps1`。插件提供 `workbuddy` MCP 服务，需要 Windows 上已安装的 WorkBuddy，以及可通过 `node` 命令运行的 Node.js 22 或更新版本。
2. 首次切换时，等正在运行的 WorkBuddy 任务完成，从 Windows 托盘退出客户端。新版随后用普通用户配置启动 WorkBuddy，并复用原有登录。
3. 在新的 Codex 聊天中选择 **WorkBuddy Control**。例如输入「在 WorkBuddy 新建任务，只回复 OK，完成后告诉我回复」。

Windows 已登记的 WorkBuddy 安装路径可以自动识别。若未登记，向 Codex 提供已安装的 `WorkBuddy.exe` 完整路径。另从快捷方式启动的 WorkBuddy 需要先从托盘退出，再由插件启动。

## 运行方式

插件启动的本机进程维持 WorkBuddy 的管道连接，Codex 聊天可以重新连接。插件在发送前核对完整草稿及当前任务。发送超时后应观察当前任务的消息，避免重复提交。

在当前聊天尚未加载 MCP 工具时，可通过已安装技能目录下的 `workbuddy-cli.mjs` 调用同一桥接。含提示文本的请求通过标准输入传入。

在版本根目录执行 `node --test`。安装状态可运行 `codex plugin list --marketplace workbuddy-tools --json` 核对。卸载可运行 `codex plugin remove codex-workbuddy-control@workbuddy-tools`，并用 `codex plugin marketplace remove workbuddy-tools` 移除本地市场登记。维护信息见 [维护文档](维护文档.md)。
