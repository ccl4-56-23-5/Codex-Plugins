# 开发与发布

GitHub按`DSH插件/Top-Directive/1.1.1`与`Codex插件/Codex-Dsh-Desktop/0.2.0+codex.20261003`保存当前源码，顶层`docs`保存组合安装与使用说明。每个版本的清单保持实际包名；目录工程名用于归档。

需要Node.js20或以上。DSH提示词插件没有额外npm运行依赖。Codex控制插件使用pnpm锁文件声明SDK1.20.2和Zod3.25.76；使用`pnpm install --frozen-lockfile --ignore-scripts --config.node-linker=hoisted`安装源码依赖。

## 需要验证实现时

下面的命令供开发者按需执行。本轮上传归档未执行这些软件测试。

```powershell
# 分别在对应组件目录运行：
node --test test/host.test.mjs
node --test scripts/control.test.mjs
node scripts/smoke-test.mjs
# 真实模型调用，会临时替换提示词；仅在用户授权验证时运行：
node scripts/live-test.mjs on 'D:\path\to\verification-records'
node scripts/retry-test.mjs 'D:\path\to\verification-records'
```

真实模型测试会连接已打开的DSH宿主。使用新的逻辑测试时应更新runId；恢复同一次交接时重用原ID。不要用辅助脚本的历史ID把新的测试冒充为新的完成结果。

## 打包规则

- DSH标准TGZ由该组件的`package.json.files`决定：lib、patch、README和LICENSE。
- Codex安装ZIP的根目录为`codex-dsh-desktop`，包含插件清单、MCP安装前模板、脚本、技能、安装器与实际运行依赖。保留嵌套依赖，不把pnpm虚拟存储、`.bin`、测试临时文件或Git目录打入包。
- 安装器会将MCP模板改为目标电脑的Node、脚本和DSH可执行文件路径，随后注册插件。
- Release只保留当前配套的DSH1.1.1与Codex0.2.0安装文件，附安装器、发行manifest与SHA-256清单。源码使用GitHub自动生成的标签归档，无需上传多份独立源码ZIP。
- 更新后重新计算安装包哈希，逐项核对解包内容、运行依赖和发布文件版本。功能通过情况应来自真实验收，不能由压缩包校验替代。

## 本机归档

工程名沿用`CodexDshDesktopPlugin`。含源码与依赖的ZIP/TGZ放在`sources/<工程>/<版本>/`；`outputs/<工程>/<版本>/`仅保留平铺文本记录。基线始终保留；普通历史源码按工作区规则保留；旧交付安装包按本次“仅最新版”要求移入Windows回收站。

原始合并前实现保存在本机版本目录的`comparison`，属于对照源码。该目录中的历史README和安装脚本用于追溯，不作为当前安装入口。
