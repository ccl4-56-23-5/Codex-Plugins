---
name: start-dsh-chat
description: Use when the user asks to open or control DSH Desktop, send a DSH message, verify an existing DSH prompt plugin, or explicitly delegate a scoped task to DSH.
---

# DSH desktop handoff

Use the installed `dsh-desktop` MCP tools. Begin with `get_desktop_status` to check the actual version and registered workspace. Select the workspace that owns the artifact. If DSH is closed, open the configured desktop executable and retry status. Do not create a conversation just to probe connectivity.

## Select one purpose

| User intent | Tool | Implementation owner |
|---|---|---|
| Explicitly send a particular message or start a chat with specified content | `open_new_conversation` | Codex |
| Call DSH to test the prompt plugin that Codex is building or fixing | `run_plugin_test` | Codex |
| Explicitly ask DSH to implement a specified task | `delegate_task` | DSH |

Never automatically forward the user's entire parent request. In particular, “create this plugin and call DSH to test it” authorizes Codex to implement and DSH to answer verification questions; it does not delegate plugin development to DSH. Do not send a default greeting when no message was provided. Check status and clarify the missing chat content if necessary.

For verification, specify the existing package and exact installed version, a neutral test question, the temporary prompt and expected reply. Do not include the parent development request. Set `allowTemporaryPromptChange:true` when the user's request authorizes testing. The host disables tools for that test session. The tool restores the original prompt; inspect the returned restoration field and recover an interrupted test with `restore_test_prompt`.

For delegated implementation, first confirm that the existing user instruction explicitly assigns that work to DSH. Include that authorization, the objective, exact workspace, allowed files, expected evidence and DSH as owner. Tell DSH to reuse existing artifacts. If Codex is implementing the same artifact, retain Codex as owner and use verification instead; do not create a second implementation.

## Track one handoff

Generate one stable `runId` for each logical handoff and reuse it for retries. Keep the same workspace and scoped content. A connection error or timeout is not evidence that the message was not accepted. Call `read_run` with the same ID before any retry. Never silently start another session to recover an uncertain result.

Read actual results with `read_run` (bounded waits up to60s). Keep these states separate:

- `accepted`: host accepted the prompt.
- `sent`: matching user message appears in the session log.
- `completed`: an actual assistant reply and successful turn end were observed.
- `visibleInDesktop`: client confirmed selection of the corresponding desktop session.

Report the actual reply and relevant evidence. Sending a message is not a successful test. A timeout, failed turn, missing prompt evidence or failed restoration must be reported as incomplete or failed. After successful verification, summarize the scope tested and restore the previous prompt. Do not infer compliance solely from a static package check or a chat title.
