---
description: Act on an in-flight Production Master investigation — review proposed actions, add evidence, correct a finding, or comment.
argument-hint: "<investigationId> <what to do>"
---

Relay this update to a Production Master investigation: **$ARGUMENTS**

The hosted service decides what an update does; you only carry the request
through the plugin's `production-master` MCP server.

1. The first word is the `investigationId`; the rest says what the user wants.
   If either is missing, ask for it.
2. Pick the one `mcp__plugin_production-master_production-master__*` tool
   that does what was asked — for example `list_actions` to see the proposed
   actions waiting for a decision, or `add_evidence`, `correct_evidence`,
   `add_correction` or `add_comment`. Pass `investigationId` with the tool's
   other arguments.
   The server has no tool that approves or rejects a proposed action. If the
   user asks to approve or reject one, do not look for a substitute: show what
   `list_actions` returns for it and tell them to approve or reject it on the
   investigation's page in the Production Master console.
3. Before any call that changes the investigation, tell the user exactly which
   tool you will call with which arguments, and go ahead only once they confirm.
4. Report the service's answer as returned, including any refusal (for example
   a missing permission) — never present a refused call as a success.

If a call fails with an authentication error, tell the user to run
`/production-master:setup`.
