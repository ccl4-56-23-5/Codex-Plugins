---
name: start-dsh-chat
description: Use when the user asks Codex to open DeepSeek Harness Desktop, start a new DSH conversation, or send a message to a fresh DSH session.
---

Call `mcp__dsh-desktop__open_new_conversation` with the user's exact message. If no message was given, use `你好`. The tool selects the DSH default workspace, creates a new conversation in the desktop UI, sends the message, and verifies it is visible. It uses Windows accessibility controls, not screenshots or guessed coordinates. Report the visible result and do not invent a session ID or response.
