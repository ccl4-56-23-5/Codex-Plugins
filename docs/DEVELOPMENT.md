# 开发与发布

源码位于`Codex-DSH插件/0.2.0+codex.20261003/`；DSH配套源码位于[DSH-Plugins](https://github.com/ccl4-56-23-5/DSH-Plugins)。

需要Node.js20或以上。依赖使用pnpm锁文件声明SDK1.20.2和Zod3.25.76；源码安装命令：`pnpm install --frozen-lockfile --ignore-scripts --config.node-linker=hoisted`。安装ZIP已包含实际运行依赖。

## 按需验证

单元测试入口为`node --test scripts/control.test.mjs`；MCP工具发现入口为`node scripts/smoke-test.mjs`。真实模型验证入口为scripts/live-test.mjs与scripts/retry-test.mjs，会临时替换提示词；仅在用户授权时运行。使用稳定runId，超时后读取原ID，确认实际回复、桌面选中和提示词恢复结果。

本轮仓库整理仅核对文件、安装包、下载入口和哈希，未运行上述软件测试。已有运行证据见[验证记录](VALIDATION.md)。

## 安装包与归档

ZIP根目录为codex-dsh-desktop，包含插件清单、安装前MCP模板、脚本、技能、Install-Codex.ps1与实际node_modules依赖。保留嵌套依赖及各包许可，排除Git目录、pnpm虚拟存储、.bin和测试缓存。安装器生成目标电脑的绝对路径并更新唯一personal条目。

Release只提供最新版Codex安装ZIP和对应SHA256SUMS.txt、release-manifest.json。更新后替换本项目版本目录，更新文档和下载链接，Git提交历史用于追溯。

本机本次整理归档于sources/Codex-Plugins/2026.10.10，outputs/Codex-Plugins/2026.10.10保留平铺文本记录。2026-10-03原合并来源与对照工程保存在原CodexDshDesktopPlugin版本归档。
