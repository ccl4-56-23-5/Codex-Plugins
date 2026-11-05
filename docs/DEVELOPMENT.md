# 开发与发布

从仓库根目录进入对应的版本目录。默认分支用于日常维护，复现旧安装包时检出对应的 Release 标签。

| 插件 | 源码 | 交付 |
| --- | --- | --- |
| DSH Control Bridge | [1.0.0 开发说明](../DSH-Control插件/1.0.0/README.md) | [1.0.0 安装包](https://github.com/ccl4-56-23-5/Codex-Plugins/releases/tag/codex-dsh-control-v1.0.0) |
| 你看你马 | [1.0.6](../你看你马/1.0.6/) | [1.0.6 安装包](https://github.com/ccl4-56-23-5/Codex-Plugins/releases/tag/codex-privacy-curtain-v1.0.6) |

旧 Codex-DSH 桌面插件的源码和安装说明见[版本目录](../Codex-DSH插件/0.2.0+codex.20261003/)。

## DSH Control Bridge

在 `DSH-Control插件/1.0.0` 使用 Node.js 22 和 pnpm。构建将 MCP SDK、Zod 和服务入口打进 `dist/server.mjs`。

```powershell
pnpm install --frozen-lockfile
pnpm run build
```

`scripts/server.mjs` 注册 MCP 工具。`scripts/client.mjs` 读取连接描述并调用本机桥。修改协议时，从 [DSH 端控制桥源码](https://github.com/ccl4-56-23-5/DSH-Plugins/tree/main/DSH控制桥插件) 同步 `lib/protocol.js` 到 `scripts/protocol.js`。两端使用同一份协议定义。

生成安装包前更新 `RUNTIME-SHA256SUMS.txt`，运行 `node scripts/check-package.mjs`。脚本会校验运行文件、启动 MCP 服务并检查 41 项工具和错误处理。连接 DSH 后先调用 `dsh_status`。终端和桌面操作分别用真实宿主的终端流和 DOM 快照验证，写入操作超时后沿用原 `operationId` 查询回执。

单装 Codex 端时，解压 Windows ZIP 后运行 `Install-Codex.ps1`。DSH 安装在其他位置时传入 `-DshRoot`。首次同时部署两端可使用同版组合包。连接描述默认位于 `~/.dsh/control-bridge/connection.json`。测试不同实例时，可通过 `DSH_CONTROL_DESCRIPTOR` 指定该实例的描述文件。

## 你看你马

构建环境为 Windows x64、.NET Framework 4.8 和 Inno Setup 6。编译检查将输出写入 `.work/check/bin`。构建安装包时，在 `-InnoCompiler` 指定 ISCC 的实际路径。

```powershell
.\build.ps1 -CheckOnly
.\build.ps1 -InnoCompiler 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' -OutputDir '.\dist'
```

| 文件 | 用途 |
| --- | --- |
| `PrivacyCurtain.cs` | 多屏幕布、输入钩子和 MCP 服务 |
| `ScopedShortcut.cs` | Codex 前台快捷键、按键释放与恢复监听 |
| `SessionSafety.cs` | Windows 锁屏、会话状态和输入桌面检查 |
| `McpUi.cs`、`PasswordSettingsForm.cs` | Codex 控制页和改密窗口 |
| `Register.cs`、`Unregister.cs`、`setup.iss` | 插件登记、安装和卸载 |

改动快捷键、会话或设置时，运行对应的 `verify-scoped-shortcut.ps1`、`verify-session-safety.ps1`、`verify-mcp-ui.ps1` 或 `verify-settings.ps1`。需要验证桌面交互时，检查 Codex 前台快捷键、锁屏后恢复监听、多屏显示及密码设置。安装步骤见 [版本说明](../你看你马/1.0.6/README.md)。

1.0.4 至 1.0.6 的开发提交在[历史分支](https://github.com/ccl4-56-23-5/Codex-Plugins/tree/archive/privacy-curtain-development)中。旧版窗口测试在该分支的 `archive/privacy-curtain-1.0.3`。

## 发布

应用代码、插件清单及安装脚本一起提交。安装包、源码包、`release-manifest.json` 和 `SHA256SUMS.txt` 放在对应的 Release。打标签后下载附件，按校验清单核对文件名和 SHA-256，再从该标签检出源码确认版本。文档改动可直接更新默认分支，既有安装包仍从原 Release 下载。
