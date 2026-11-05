# Codex → DeepSeek Harness Desktop

The MCP tool `open_new_conversation` opens the installed DSH Desktop, selects its default workspace, starts a new conversation, sends the requested message, and verifies the message appears in the desktop window. It uses Windows UI Automation control names and patterns plus Unicode keyboard input. It does not use screenshots or guessed coordinates.

The earlier headless implementation created session files but did not make the conversation visible in DSH Desktop. The current tool operates the Desktop UI directly. It returns only facts verified in that window.
