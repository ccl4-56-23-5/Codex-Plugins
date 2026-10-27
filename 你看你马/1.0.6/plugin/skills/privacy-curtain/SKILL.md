---
name: privacy-curtain
description: 在 Windows 开启或查询 Codex 隐私幕布、使用用户提供的密码解锁，或打开本地改密窗口。
---

用户要求开启幕布时调用 curtain_lock，再以 curtain_status 核对 locked=true、监视器数和截图排除状态。用户要求解锁时使用其提供的密码；初始密码按用户约定为 123456。密码如已更改而未知，交给用户在实体键盘输入，不猜测或读取 password.dpapi。

用户本人可直接在实体键盘输入 6–32 位数字，再按 Enter 解锁；Backspace 删除，Esc 清空。鼠标操作被拦截，幕布不抢焦点。修改密码用本地窗口，由用户填写。

手动入口在 Codex：你看你马控制页及插件设置中的“开启隐私幕布”；桌面客户端在前台时可按 Ctrl+Shift+左Alt+N，松开所有按键后开启。Windows 锁屏、切换安全桌面或会话状态无法确认时会自动停止幕布并释放输入拦截；系统解锁后需再次手动开启。幕布不调用 LockWorkStation，不改变 Windows 安全设置，不暂停任务。

截图排除依赖 Windows 10 2004+ 的 WDA_EXCLUDEFROMCAPTURE，放行带 Windows 注入标记的输入，不限于 Codex。浏览器/DOM 自动化可继续。不同截图或输入驱动必须实测；状态中的注入计数只证明已观察到注入，不证明所有动作成功。

应用层幕布可被 Ctrl+Alt+Del、任务管理器、管理员或同用户进程绕过，不能当安全隔离。插件启用、MCP 进程启动和读取状态均不自动开幕布。卸载前先由用户解锁；后台 guard 生命周期独立，关闭聊天不会自动解锁。