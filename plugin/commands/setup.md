---
description: Set up, change or remove the access token the Production Master plugin uses to reach the hosted service.
---

Help the user connect this plugin to the Production Master hosted service.
Do not ask the user to paste the token into the chat, and never print it.

The plugin reaches the service through its `production-master` MCP server,
authenticated with a personal access token kept in the plugin's settings
(the `api_token` option, stored in the OS credential store).

Walk the user through it:

1. **Create a token.** In the Production Master console, open Settings, then
   Access tokens, and create one. A viewer role can open investigations;
   starting runs and acting on them needs the engineer role or above.
2. **Store it.** Run `/plugin`, open the Installed tab, select
   `production-master`, and choose Configure. Paste the token into
   "Production Master access token". From a terminal,
   `claude plugin configure production-master` does the same.
3. **Reconnect.** Run `/mcp` and reconnect
   `plugin:production-master:production-master` (or restart Claude Code), then
   check that it lists its tools.

To **change** the token, repeat steps 2 and 3. To **remove** it, revoke the
token in the console (this cuts off access at once), then clear it from the
plugin's settings or uninstall the plugin.
