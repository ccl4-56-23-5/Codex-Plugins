# Codex控制DSH桌面0.2.0

本版配套`dsh-top-directive@1.1.1`，使用桌面宿主原生会话接口。会话在DSH桌面选中并返回实际回复，不依赖固定中文按钮名。

## 任务交接

| 用途 | 工具 | 实现负责人 |
|---|---|---|
| 明确发送一条聊天消息 | open_new_conversation | Codex |
| 验证Codex已经制作的提示词插件 | run_plugin_test | Codex |
| 用户明确委派DSH实施限定任务 | delegate_task | DSH |

不自动转发父任务，不自动发送“你好”。“制作插件并调用DSH测试”使用验证模式，DSH收到现有包名、版本和测试问题，工具由宿主关闭。委派工具要求授权来源、目标、允许文件和验收证据。

`get_desktop_status`只读取连接、版本和注册工作区；`read_run`读取实际回复；`restore_test_prompt`恢复中断测试。测试临时正文在finally中恢复，并保留可恢复记录；遇到其他窗口的用户修改时保留该修改，不覆盖。

每次交接使用稳定runId。超时后读取相同runId，不另开会话。accepted、sent、completed和visibleInDesktop分别表示接收、日志中的消息、真实回复与完成事件、桌面选中确认。

## 安装

先安装合并版DSH插件并打开桌面，然后运行包内`Install-Codex.ps1`。安装器生成本机Node路径和MCP脚本路径，更新personal marketplace中同名插件，保留原安装目录供回退，不修改其他插件或已有审批设置。

安装器要求已有personal市场及唯一同名条目。首次配置、升级步骤和恢复方法见[完整安装说明](https://github.com/ccl4-56-23-5/Codex-Plugins/blob/main/docs/INSTALLATION.md)。本包`.mcp.json`是安装前模板，运行安装器后才生成本机绝对路径。

如果当前Codex会话仍显示旧的一项工具，重新连接插件或重启Codex后使用新版本的六项工具。已运行的MCP进程不会自行切换代码。

## 验证

`node --test scripts/control.test.mjs`验证正文恢复、失败处理、外部修改保留和交接契约。`node scripts/smoke-test.mjs`验证MCP工具发现和开发请求拒绝，读取工具不会创建聊天。

真实模型验证使用`run_plugin_test`：指定版本、工作区、只需回答的问题、临时提示词和预期回复。实际结果必须同时包含回复、提示词装配摘要、零工具调用和恢复成功，才返回pass。

原版0.1.0源码保留在既有安装位置；本包不运行旧UI Automation或headless账户脚本。

2026-10-10发布整理更新了验收辅助脚本的输出路径；默认使用当前工作目录下`test-results`，也可显式传入目录或设置`DSH_TEST_OUTPUT`。运行时的桥接和MCP实现保持2026-10-03已验收的代码。该次发布整理未重新运行软件或模型测试。

