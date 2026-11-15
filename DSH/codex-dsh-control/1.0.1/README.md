# Codex DSH Control 1.0.1

配套 DSH 端 `dsh-control-bridge@1.0.0`，提供 44 个 MCP 工具。会话、模型、工作区、终端和桌面控件使用宿主接口。最高指令测试使用 `dsh-top-directive` 1.1.2 的本地接口。

解压 Windows ZIP 后运行 `Install-Codex.ps1`。安装器使用 DSH 自带的 Node，运行依赖已包含在包内。安装后重新连接 MCP 或新开 Codex 对话，再调用 `dsh_status`。

DSH桥连接描述默认读取`~/.dsh/control-bridge/connection.json`；可使用`DSH_HOME`或`DSH_CONTROL_DESCRIPTOR`指定另一用户配置。连接只允许127.0.0.1的预期路由，禁止重定向。

使用顺序：状态→会话/工作区或host_catalog→读取具体契约→执行→查询回执和实际状态。DOM操作先获取在线clientId和快照，再使用nodeId。修改使用稳定operationId，失败或超时后不要换编号重复发送。具体边界见技能文件和DSH端README。

## 最高指令测试

在 DSH 空闲时调用 `dsh_prompt_test`。传入固定 `runId`、注册工作区、已安装的最高指令版本、临时正文、测试问题和预期回复，并确认本次允许临时改动。工具检查实际回复、装配正文摘要和零工具调用，结束后核对原正文与启用状态。

超时后用 `dsh_prompt_test_read` 读取同一 `runId`。测试进程退出后，若仍有恢复记录，用 `dsh_prompt_test_restore` 恢复同一编号。恢复按版本核对，遇到并发编辑会保留当前正文。恢复日志属于 DSH 本机数据。

## 构建

运行 `pnpm install --frozen-lockfile`、`pnpm test` 和 `pnpm run build`。宿主协议定义从 DSH 端 `lib/protocol.js` 同步到 `scripts/protocol.js`。最高指令工具在 `scripts/prompt-test.mjs`，随 `dist/server.mjs` 一起打包。
