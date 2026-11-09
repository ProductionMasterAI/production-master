---
description: Start a Production Master investigation on the hosted service and follow its progress. The investigation runs entirely server-side.
argument-hint: "[JIRA-TICKET or bug description]"
---

Start a Production Master investigation for: **$ARGUMENTS**

The run executes entirely on the Production Master hosted service. You only
relay the request and the results through the plugin's `production-master` MCP
server — do no analysis of your own and do not read the user's code for it.

1. Call `mcp__plugin_production-master_production-master__start_investigation`
   with `input` set to the text above. If the argument is empty, ask the user
   for a ticket key or a bug description first.
2. Tell the user the returned `investigationId` and console link.
3. Follow progress with
   `mcp__plugin_production-master_production-master__get_investigation`,
   passing `investigationId` and the `cursor` from the previous response. After
   each call, summarise only what is new (phase changes, findings, proposed
   actions) in a line or two. Stop when the response reports the run is done,
   or when it asks for a decision.
4. When the run is done, call
   `mcp__plugin_production-master_production-master__get_report` and present
   the report.
5. If a step proposes an action, show it to the user and wait for their answer.
   Never approve or reject on their behalf — they use
   `/production-master:update` for that.

If a call fails with an authentication error, the access token is missing,
expired or revoked: tell the user to run `/production-master:setup`. Report any
other error as it was returned — never present a failed call as an empty result.
