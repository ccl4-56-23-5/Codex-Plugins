# Codex ↔ DSH

这套桥接由两个 Windows 插件组成。Codex 端提供 MCP 工具，DSH 端提供会话、模型、工作区和桌面控件接口。

| 安装位置 | 插件 | 版本 | 源码 |
| --- | --- | --- | --- |
| Codex | Codex DSH Control | 1.0.1 | [codex-dsh-control](codex-dsh-control/1.0.1/) |
| DSH | DSH Control Bridge | 1.0.0 | [dsh-control-bridge](dsh-control-bridge/1.0.0/) |

## 安装

1. 在 Windows 安装 Codex Desktop 和 DSH，并启动过 DSH 桌面配置。确认 PowerShell 可运行 `codex --version`。
2. 从 [CodexBridge Releases](https://github.com/ccl4-56-23-5/CodexBridge/releases/tag/codex-dsh-control-v1.0.1) 下载并解压 `DSH-Control-Combo-1.0.1-Windows.zip`。
3. 在解压目录打开 PowerShell，运行组合安装脚本。

   ```powershell
   .\Install-All.ps1
   ```

   DSH 装在其他位置时，把实际安装目录传给脚本。

   ```powershell
   .\Install-All.ps1 -DshRoot 'D:\Program Files\DeepSeekHarness'
   ```

4. 保持 DSH 运行。如果 DSH 插件尚未加载，重启 DSH 再检查插件列表。在 Codex 新开聊天或重新连接 MCP，调用 `dsh_status` 查看桥接状态。

已经安装其中一端时，可分别运行组合包内的 `DSH\Install-DSH.ps1` 和 `Codex\Install-Codex.ps1`。DSH 插件管理也支持从组合包添加 `DSH\dsh-control-bridge-1.0.0.tgz`。仅在使用最高指令测试功能时安装 [DSH 最高指令 1.1.2](https://github.com/ccl4-56-23-5/DSH-Plugins/releases/tag/top-directive-v1.1.2)。

DSH 端源码来自 [DSH-Plugins 的 1.0.0 发布快照](https://github.com/ccl4-56-23-5/DSH-Plugins/releases/tag/dsh-control-v1.0.0)。本目录收录双方的对应版本，便于查阅和部署。

[旧版 Codex-DSH 桌面插件归档](archive/Codex-DSH插件/README.md)
