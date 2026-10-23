# 你看你马 1.0.3

Windows 10 2004 及更新版本，x64；使用系统自带 .NET Framework 4.8，无 Node/Python 依赖，无联网服务。

运行安装包后，在 Codex 插件目录的 Personal 来源安装/启用 **你看你马**。如目录未刷新，关闭再打开插件目录；新聊天可重新发现 MCP。不重启 Windows，不终止现有 Codex 任务。

- 对 Codex 说“开启隐私幕布”，调用 `curtain_lock`；“查询幕布状态”调用 `curtain_status`。
- 开始菜单也有“开启隐私幕布”和“修改密码”。
- 初始密码 **123456**。在真实键盘直接输入数字，再按 **Enter** 解锁；Backspace 删除，Esc 清空。屏幕密码框只显示圆点，无须点击，鼠标输入被拦截。
- 改密窗口支持 6–32 位数字，须提供原密码。密码通过 PBKDF2-SHA256（180000 轮、随机盐）散列，再以当前 Windows 用户 DPAPI 加密，保存在 `%LOCALAPPDATA%\CodexPrivacyCurtain\data\password.dpapi`。升级保留密码。
- 插件可使用用户提供的密码调用 `curtain_unlock`；聊天中的密码会进入聊天/工具记录，日常建议用实体键盘。

幕布覆盖所有已连接显示器，不抢占前台焦点、不调用 Windows 锁定、不暂停任务。使用 WDA_EXCLUDEFROMCAPTURE，使支持该接口的截图不包含幕布；使用低级键鼠钩子拦截实体事件，放行带 Windows 注入标记的事件。Computer Use 的 SendInput、UI Automation 和窗口截图按此方式兼容；对其他输入驱动和录屏实现需要另行实测。截屏排除不可用时会中止开启并清理钩子。

这属于应用层的隐私保护。Ctrl+Alt+Del、安全桌面、任务管理器、其他置顶窗口、管理员及同用户程序可能绕过。所有带注入标记的输入均放行，不只 Codex；不防恶意软件、远程控制或同用户脚本。保护依赖 guard 持续运行；系统强制移除钩子、崩溃或结束 guard 会失去输入拦截，不能替代安全锁屏。

关闭聊天或禁用插件不会自动结束独立的幕布进程。先解锁再卸载；Codex 插件目录中先卸载插件，再通过 Windows 已安装应用卸载原生程序。保留密码和本地插件目录备份，不修改其他插件或 Codex 配置。

开发命令：`bin\PrivacyCurtain.exe --status` 读状态；`--serve` 启动 stdio MCP；`--lock` 开启；`--settings` 改密；`--unlock` 从标准输入读密码（不使用命令行密码参数）。`--smoke` 只供兼容性测试，20 秒自动解除，正式 lock 不自动解除。

实现依据：[OpenAI 插件打包](https://developers.openai.com/plugins/build/plugins)、[截图排除 API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)、[键盘注入标记](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-kbdllhookstruct)、[鼠标注入标记](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-msllhookstruct)。
