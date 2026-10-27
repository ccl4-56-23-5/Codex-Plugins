# 你看你马 1.0.6

Windows 多屏隐私幕布。只在 Codex 客户端提供手动入口及快捷键，实体键盘输入密码解锁，Codex 可继续工作。

## 在 Codex 开启

**Ctrl+Shift+左Alt+N**：Codex 桌面程序处于前台时按下，松开所有按键后开启；切换到其他应用时不响应。这一范围包括同一桌面程序中的 ChatGPT 和 Work 页面。快捷键依赖本地插件 MCP 服务正在运行，不创建托盘、桌面图标或开机自启动项。

Windows 插件在其 MCP 服务生命周期内使用低级键盘钩子识别该组合，检查前台窗口所属的 OpenAI.Codex 包，不注册系统全局热键，也不记录键盘内容；其他程序中的键盘事件直接放行。Windows 锁屏或切换安全桌面时会卸下快捷键钩子，返回安全桌面后再恢复。当前采用的是插件实现，而不是 Codex 内置的快捷键绑定。当前只识别已核验的 Windows Store/MSIX 包 `OpenAI.Codex_2p2nqsd0c76g0`；其他安装渠道尚未验证。右 Alt 不触发，以避免部分键盘布局的 AltGr 输入误触。

- 打开 Codex 的“插件”，选择“你看你马”，在“手动开启”中点击“开启隐私幕布”。
- 本版还提供 Codex 内控制页及侧栏快捷动作。当前客户端的插件侧栏项默认隐藏；如果“探索”中出现“你看你马”，可以选择“固定到侧边栏”。侧栏显示和点击效果取决于当前宿主版本，需实际确认。
- 控制页包含开启、查看状态与修改密码；打开页面本身不会开启幕布。

幕布开启时，实体键盘直接输入密码并按 Enter 解锁；Backspace 删除，Esc 清空。初次安装密码为 **123456**；升级保留已有密码。

## 与 Windows 锁屏共存

当 Windows 锁定、会话断开、输入桌面切换或会话状态无法确认时，幕布会停止并释放输入拦截，让 Windows 完成锁屏及解锁。Windows 解锁后，幕布不会自动重新开启；需要时在 Codex 内再次开启。在系统锁定或安全桌面时，插件拒绝开启幕布。

该行为通过状态门控、系统会话锁定通知和短周期复核实现。自动测试已验证模拟锁屏通知后幕布退出；用户已确认1.0.6可用。

## 安装与升级

运行 `CodexPrivacyCurtain-Setup-1.0.6-x64.exe`，按当前用户安装，再在 Codex 的 Personal 来源安装或更新“你看你马”。新版没有 Windows 桌面、开始菜单、托盘或在其他程序中生效的全局快捷键入口，不创建快捷入口自启动项。

从1.0.4升级时，安装器会停止属于1.0.4的托盘进程并释放全局快捷键；仅当旧快捷方式和自启动值与该插件自身的已知路径完全一致时才迁移。旧快捷方式移入 `%LOCALAPPDATA%/CodexPrivacyCurtain/data/legacy-shortcuts`，用户自行更改过的快捷方式保留。原密码不变。关闭聊天不会自动解锁当前幕布。

运行要求：Windows 10 2004 或更新版本、x64、.NET Framework 4.8。无需另装 Python、Node 或系统服务。

## 密码与工作方式

改密入口位于 Codex 控制页或插件设置；新密码支持 6–32 位数字，由用户在本地窗口输入原密码及两次新密码。密码以随机盐 PBKDF2-SHA256 散列后使用当前 Windows 用户 DPAPI 加密，存于 `%LOCALAPPDATA%/CodexPrivacyCurtain/data/password.dpapi`。

每屏幕创建独立置顶窗口，使用 `WDA_EXCLUDEFROMCAPTURE` 排除幕布截图。低级键鼠钩子拦截实体输入，放行 Windows 标记的注入输入；不调用 Windows 锁定或暂停任务。应用层幕布不替代系统安全锁定。

## 源码及验证

`SessionSafety.cs` 负责系统会话和输入桌面检查；`PrivacyCurtain.cs` 负责幕布、输入钩子和 MCP；`McpUi.cs` 提供 Codex 内控制页和侧栏入口；`LegacyLauncher.cs` 仅处理旧版入口退出；`ScopedShortcut.cs` 负责 Codex 前台快捷键。

```powershell
.\build.ps1 -InnoCompiler 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' -OutputDir '输出目录'
.\verify-scoped-shortcut.ps1
.\verify-session-safety.ps1
.\verify-mcp-ui.ps1
.\verify-settings.ps1
```

快捷键自动检查33项手势、36项生命周期/模拟会话；会话安全自动检查25项单元和12项隔离幕布。自动验证使用独立数据目录，并向测试幕布及监听窗口发送模拟锁屏通知；自动验证没有实际锁定 Windows，也未操作真实物理按键或客户端界面。MCP 页面验证使用隔离桥接，不等于 Codex 客户端的显示和点击验收。`docs/` 保留1.0.3历史记录，当前结果见输出目录。

[MIT许可](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)