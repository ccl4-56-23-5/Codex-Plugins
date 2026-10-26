# 你看你马 1.0.4

Windows 多屏隐私幕布，实体键盘输入密码解锁，Codex 可继续工作。

## 一键开启

- **Ctrl+Shift+Alt+N**：全局开启，Codex 在前台、后台均可使用，无需发送聊天消息。
- **单击任务栏托盘里的马头图标**：立即开启；右键菜单可开启幕布、修改密码或退出快捷入口。
- **桌面“你看你马 · 开启幕布”**和开始菜单“开启隐私幕布”：直接开启。
- **Codex → 插件 → 你看你马 → 手动开启 → 开启隐私幕布**：插件设置按钮，宿主需刷新到本版工具。

重复触发保持开启；快捷键不提供解锁。实体键盘输入密码后按 Enter 解锁，Backspace 删除、Esc 清空。初次安装密码为 **123456**；升级保留已有密码。

## 安装与升级

运行 `CodexPrivacyCurtain-Setup-1.0.4-x64.exe`，按当前 Windows 用户安装。安装结束启动快捷键与托盘；安装向导可选择登录 Windows 后启动快捷入口。启动入口本身不会开幕布。

在 Codex 的 Personal 来源安装/更新“你看你马”，也可执行 `codex plugin add codex-privacy-curtain@personal`。新聊天可重新发现工具；插件设置页关闭后重开以刷新按钮。桌面入口和全局快捷键独立于 Codex 工具刷新。

若快捷键被其他程序占用，会弹出托盘提示，托盘及桌面入口仍可使用。关闭占用程序后，从托盘退出快捷入口，再用开始菜单“启动快捷键与托盘”重新注册。

退出快捷入口、关闭聊天均不会关闭已经开启的幕布。先解锁再卸载；卸载会停止本版本入口并清理其自启动项，保留密码。升级只交接快捷入口，已开启的旧幕布继续运行，用户解锁后下次开启使用新版。

## 密码与运行要求

改密入口：Codex 插件设置的“密码与解锁 → 修改密码”，或托盘右键菜单。新密码支持 6–32 位数字，由用户在本地窗口输入原密码及两次新密码。

密码使用随机盐 PBKDF2-SHA256（180000轮）散列和当前用户 DPAPI 加密，保存在 `%LOCALAPPDATA%/CodexPrivacyCurtain/data/password.dpapi`。日志不记录输入内容。

要求 Windows 10 2004 或更新版本、x64、系统 .NET Framework 4.8。无需 Python、Node、系统服务或管理员权限。

## 工作方式

每屏幕创建置顶、不抢焦点的覆盖窗口，使用 `WDA_EXCLUDEFROMCAPTURE` 排除幕布截图。低级键鼠钩子拦截实体输入，放行 Windows 标记的注入输入；不调用 Windows 锁定、不暂停任务。应用层遮罩可被 Ctrl+Alt+Del、任务管理器和同用户进程绕过，不替代系统安全锁定。

## 本版验证

- 19项快捷入口检查：实际 Windows 快捷键事件、长按去重、重复开启、双屏覆盖及截图排除、注入事件放行、快捷键冲突和释放、入口替换、退出入口保持幕布、真实密码文件不变。
- 10项 MCP 设置检查：版本、入口布局、中文按钮、严格参数与密码保留。
- 原生密码窗口布局回归：96/120/144/192 DPI 共32项。

测试使用独立数据目录。Windows 实体键盘手动验收、重启后自启动，以及当前 Codex 版本实际显示设置按钮，仍需用户确认。`docs/` 保留的1.0.3记录属于历史验证，当前结果见 `quick-launcher-verification.json`、`settings-verification.json` 和 `ui-verification.json`。候选尚未上传 GitHub。

## 源码和构建

`QuickLauncher.cs` 提供全局快捷键、托盘、单实例与版本交接；`PrivacyCurtain.cs` 提供幕布、密码、IPC和MCP；`PasswordSettingsForm.cs` 提供改密窗口。技术ID保持 `codex-privacy-curtain`。

```powershell
.\build.ps1 -InnoCompiler 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' -OutputDir '输出目录'
.\verify-quick-launcher.ps1
.\verify-settings.ps1
```

`--resident` 启动入口；`--resident-status` 查询快捷键注册状态；`--resident-stop` 仅停止同路径入口；`--resident-replace` 用于安装升级交接。`--lock` 开启幕布，`--status` 查询幕布，`--serve` 启动MCP。自动化测试须使用隔离 `CPC_DATA_DIR`；`--resident-test` 的测试幕布5秒自动解除。

[MIT许可](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)