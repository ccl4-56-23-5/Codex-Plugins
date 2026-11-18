# 开发与发布

从仓库根目录进入对应的版本目录。默认分支用于日常维护，复现旧安装包时检出对应的 Release 标签。

| 插件 | 源码 | 交付 |
| --- | --- | --- |
| Codex DSH Control | [1.0.1 开发说明](../DSH/codex-dsh-control/1.0.1/README.md) | [组合安装包](https://github.com/ccl4-56-23-5/CodexBridge/releases/tag/codex-dsh-control-v1.0.1) |
| DSH Control Bridge | [1.0.0 开发说明](../DSH/dsh-control-bridge/1.0.0/README.md) | [组合安装包](https://github.com/ccl4-56-23-5/CodexBridge/releases/tag/codex-dsh-control-v1.0.1) |
| WorkBuddy Control | [1.0.3+4](../WorkBuddy/codex-workbuddy-control/1.0.3+4/) | [1.0.3+4 安装包](https://github.com/ccl4-56-23-5/CodexBridge/releases/tag/codex-workbuddy-control-v1.0.3%2B4) |

旧 Codex-DSH 桌面插件的源码和安装说明见[归档索引](../DSH/archive/Codex-DSH插件/README.md)。

## DSH Control Bridge

在 `DSH/codex-dsh-control/1.0.1` 使用 Node.js 22 和 pnpm。构建将 MCP SDK、Zod 和服务入口打进 `dist/server.mjs`。

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

`scripts/server.mjs` 注册 MCP 工具。`scripts/client.mjs` 读取连接描述并调用本机桥。修改协议时，从 [DSH 端控制桥源码](https://github.com/ccl4-56-23-5/DSH-Plugins/tree/main/DSH控制桥插件) 同步 `lib/protocol.js` 到 `scripts/protocol.js`。两端使用同一份协议定义。

生成安装包前更新 `RUNTIME-SHA256SUMS.txt`，运行 `node scripts/check-package.mjs`。脚本会校验运行文件、启动 MCP 服务并检查 44 项工具和错误处理。连接 DSH 后先调用 `dsh_status`。终端和桌面操作分别用真实宿主的终端流和 DOM 快照验证，写入操作超时后沿用原 `operationId` 查询回执。

最高指令测试位于 `scripts/prompt-test.mjs`。它通过最高指令插件的本地接口读取版本和设置，记下原状态，以版本号约束临时替换，读取真实会话结果，然后恢复并复核。恢复记录存在时，先沿用原 `runId` 调用 `dsh_prompt_test_restore`。测试期间宜保持 DSH 空闲。

单装 Codex 端时，解压 Windows ZIP 后运行 `Install-Codex.ps1`。DSH 安装在其他位置时传入 `-DshRoot`。首次同时部署两端可使用同版组合包。连接描述默认位于 `~/.dsh/control-bridge/connection.json`。测试不同实例时，可通过 `DSH_CONTROL_DESCRIPTOR` 指定该实例的描述文件。

## WorkBuddy Control

在 `WorkBuddy/codex-workbuddy-control/1.0.3+4` 运行 `node --test`。Windows 安装与验收步骤见 [WorkBuddy 安装指南](../WorkBuddy/README.md)。

## 发布

应用代码、插件清单及安装脚本一起提交。安装包、源码包、`release-manifest.json` 和 `SHA256SUMS.txt` 放在对应的 Release。打标签后下载附件，按校验清单核对文件名和 SHA-256，再从该标签检出源码确认版本。文档改动可直接更新默认分支，既有安装包仍从原 Release 下载。
