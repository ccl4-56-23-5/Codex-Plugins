# 功能与使用



控制插件提供六项MCP工具。

| 工具 | 用途 |
|---|---|
| `get_desktop_status` | 查看桌面宿主、插件版本和已注册工作区 |
| `open_new_conversation` | 发送用户明确提供的聊天内容，要求`explicitUserMessage:true` |
| `run_plugin_test` | 对现有确切版本进行回答测试；DSH只回答问题，宿主清空该会话的工具 |
| `delegate_task` | 用户明确让DSH实施时，指定目标、授权来源、工作区、允许文件和验收证据 |
| `read_run` | 使用同一runId读取真实回复、完成事件及桌面选中状态 |
| `restore_test_prompt` | 恢复中断测试临时替换的提示词 |

“制作插件并调用DSH测试”的实施负责人为Codex。传给DSH的验证内容仅包含现有插件、版本和测试问题；完整开发需求不会自动再次转发。

每次交接使用一个稳定runId。超时后先读取该ID，重试仍使用同一ID。`accepted`、`sent`、`completed`和`visibleInDesktop`分别对应接收、消息落入日志、实际回复完成和桌面选中；发送成功本身不能作为验收结论。

验证工具会临时替换正文并在结束时恢复。用户在其他窗口作出的新修改会保留。异常退出后先调用恢复工具并检查结果。


DSH侧提示词输入框和开关见[最高指令使用指南](https://github.com/ccl4-56-23-5/DSH-Plugins/blob/main/最高指令插件/1.1.1/docs/USER_GUIDE.md)。
