# Codex插件

Codex桌面插件集合。每个项目只保留当前最新版的源码和安装包。

| 插件 | 当前版本 | 功能 | 下载与安装 |
|---|---|---|---|
| [Codex-DSH插件](Codex-DSH插件/README.md) | 0.2.0+codex.20261003 | 打开DSH会话、验证现有插件、读取真实回复、按授权委派任务 | [安装包](https://github.com/ccl4-56-23-5/Codex-Plugins/releases/tag/codex-dsh-v0.2.0) · [安装指南](docs/INSTALLATION.md) |
| [DSH Control Bridge](DSH-Control插件/README.md) | 1.0.0 | 41个MCP工具：原生API、动态接口、终端流和DOM控件树 | [安装包](https://github.com/ccl4-56-23-5/Codex-Plugins/releases/tag/codex-dsh-control-v1.0.0) · [安装说明](DSH-Control插件/1.0.0/README.md) |
| [你看你马](你看你马/README.md) | 1.0.3 | 双屏隐私幕布、密码解锁、保留 Computer Use 操作，附插件内改密入口 | [安装包](https://github.com/ccl4-56-23-5/Codex-Plugins/releases/tag/codex-privacy-curtain-v1.0.3) · [使用说明](你看你马/1.0.3/README.md) |

## 目录

```text
Codex-Plugins/
├─ Codex-DSH插件/0.2.0+codex.20261003/
├─ DSH-Control插件/1.0.0/
└─ 你看你马/1.0.3/
```

安装ZIP包含所需运行依赖，源码与安装文件在版本目录中。内部插件名为`codex-dsh-desktop`，npm版本为0.2.0。

## 使用说明

- [功能与工具](docs/USER_GUIDE.md)
- [Windows安装、首次市场配置与升级](docs/INSTALLATION.md)
- [架构与数据流程](docs/ARCHITECTURE.md)
- [开发与发布](docs/DEVELOPMENT.md)
- [验证记录与适用范围](docs/VALIDATION.md)

DSH侧配套的[最高指令插件1.1.1](https://github.com/ccl4-56-23-5/DSH-Plugins/tree/main/最高指令插件/1.1.1)在DSH-Plugins仓库。制作并测试插件时由Codex负责实施，DSH只执行明确范围内的验证或用户授权的任务。超时后使用同一runId读取结果，避免重复创建会话。

默认分支和Release仅保留最新版；Git提交历史用于追溯。源码ZIP中的MCP文件是安装前模板，安装器会生成本机路径。

[MIT许可](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
