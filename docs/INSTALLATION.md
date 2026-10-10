# Windows安装、升级与恢复

## 运行条件

- 已安装DSH桌面并初始化`desktop`profile。本次真实验收使用DSH0.2.0-rc.2；其他宿主版本需重新确认接口兼容性。
- DSH默认位置为`D:\DeepSeekHarness`；用户配置位于`%USERPROFILE%\.dsh`。安装器允许用`-DshRoot`指定其他安装目录。
- Codex控制插件安装器依赖可在命令行找到的`codex`，以及已有的`personal`marketplace中唯一的`codex-dsh-desktop`条目。此安装器用于该条目的本机更新；首次安装到没有此条目的电脑需要先完成Codex插件市场注册。
- DSH插件无需额外npm运行依赖。Codex ZIP内包含SDK和Zod及其运行依赖，更新时无需下载npm包。GitHub源码不包含`node_modules`；运行源码前需按锁文件安装依赖。

## 1. 安装DSH提示词插件

从本版Release下载`dsh-top-directive-1.1.1.tgz`与`Install-DSH.ps1`，放在同一目录，先核对`SHA256SUMS.txt`。

可以通过DSH插件管理导入TGZ。使用附带安装器时，先结束正在运行的DSH任务并退出桌面，再在该目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-DSH.ps1
# 自定义DSH路径：
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-DSH.ps1 -DshRoot 'E:\DeepSeekHarness'
```

安装器备份profile清单、锁文件和已有提示词，更新本地包依赖，移除旧`dsh-initial-prompt`条目并保留一份`dsh-top-directive`。已有`top-directive/config.json`继续使用。完成后重新打开DSH，在插件页编辑正文和开关。

## 2. 更新Codex控制插件

下载并解压`codex-dsh-desktop-0.2.0.zip`，进入`codex-dsh-desktop`目录，运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Codex.ps1
# DSH安装在其他位置时，同样指定-DshRoot。
```

默认安装到`%USERPROFILE%\plugins\codex-dsh-desktop-0.2.0-codex.20261003`。安装器生成本机`.mcp.json`，更新已有同名personal条目并调用Codex注册命令；保留原注册与配置备份。源码中的MCP文件仅是安装前模板，直接导入模板不能替代本机安装步骤。

重新连接插件或重启Codex，使已启动的MCP进程载入新版。用`get_desktop_status`确认DSH插件1.1.1和协议2。控制插件应提供六项工具，详见[功能说明](USER_GUIDE.md)。

### 首次建立personal条目

依据[OpenAI官方插件打包文档](https://developers.openai.com/plugins/build/plugins)，个人市场文件是`%USERPROFILE%\.agents\plugins\marketplace.json`，其中`source.path`相对于用户目录。不存在该文件时，可以建立如下最小目录；已有personal市场时，仅将本插件条目合并进其`plugins`数组，保留其他条目。

```json
{
  "name": "personal",
  "plugins": [{
    "name": "codex-dsh-desktop",
    "source": {"source": "local", "path": "./plugins/codex-dsh-desktop-0.2.0-codex.20261003"},
    "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
    "category": "Productivity"
  }]
}
```

准备好条目后运行本包的安装器，由它复制运行文件、生成本机MCP配置并调用`codex plugin add codex-dsh-desktop@personal`。此首次配置步骤未在新的Windows用户下重新验收；本机原有条目的更新已于2026-10-03验收。

## 校验安装包

```powershell
Get-FileHash -Algorithm SHA256 .\dsh-top-directive-1.1.1.tgz
Get-FileHash -Algorithm SHA256 .\codex-dsh-desktop-0.2.0.zip
```

将结果与同版Release的`SHA256SUMS.txt`比较。校验文件一致只确认下载完整；运行验收需要实际模型回复与桌面状态。

## 恢复与卸载

- 临时测试中断：调用`restore_test_prompt`，确认恢复结果后继续使用。
- 配置文件损坏：插件尝试读取`config.json.bak`并显示恢复提示。手工恢复前先退出DSH并保留现有文件。
- 部署恢复：安装器打印备份目录。退出DSH后恢复对应profile清单与锁文件，再按该profile的依赖重新安装；不要混用其他版本的清单。
- 卸载DSH插件：通过DSH插件管理移除`dsh-top-directive`。配置属于用户数据，按需要另行保留或删除。
- 回退Codex：使用原插件安装目录与对应marketplace备份，重新注册旧版本并重新连接。

仅最新版安装包对外交付；历史源码和既有部署备份可以用于核对变更与回退。
