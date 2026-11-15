# Codex DSH Control 1.0.0

配套DSH端`dsh-control-bridge@1.0.0`。通过官方MCP SDK封装41个结构化工具，直接调用宿主API、动态Remote契约或桌面DOM控件；不依赖截图识别。

解压Windows ZIP后运行`Install-Codex.ps1`。安装器使用DSH自带Node，MCP运行文件已打包依赖，无需npm下载；既有`codex-dsh-desktop`插件不修改。安装后重新连接MCP或新开Codex对话，先使用`dsh_status`。

DSH桥连接描述默认读取`~/.dsh/control-bridge/connection.json`；可使用`DSH_HOME`或`DSH_CONTROL_DESCRIPTOR`指定另一用户配置。连接只允许127.0.0.1的预期路由，禁止重定向。

使用顺序：状态→会话/工作区或host_catalog→读取具体契约→执行→查询回执和实际状态。DOM操作先获取在线clientId和快照，再使用nodeId。修改使用稳定operationId，失败或超时后不要换编号重复发送。具体边界见技能文件和DSH端README。

构建：`pnpm install --frozen-lockfile`，`pnpm run build`。协议定义从DSH源码`lib/protocol.js`同步到`scripts/protocol.js`，应保持SHA-256一致。构建输出`dist/server.mjs`包含MCP SDK与Zod。版本锁和第三方许可随源码保留。
