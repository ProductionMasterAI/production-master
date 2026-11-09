---
description: Re-attach to an in-flight or completed Production Master investigation and follow it to its report.
argument-hint: "<investigationId>"
---

Re-attach to Production Master investigation **$ARGUMENTS**.

Nothing is re-computed locally: the hosted service holds the run's full
history, and you only relay it through the plugin's `production-master` MCP
server.

1. If no investigation id was given, ask the user for one.
2. Call `mcp__plugin_production-master_production-master__get_investigation`
   with that `investigationId` and no `cursor`, and summarise where the run
   stands: its phase, its key findings so far, and any action waiting for a
   decision.
3. If the run is still going, keep calling `get_investigation` with the
   returned `cursor` and summarise only what is new, until it is done or asks
   for a decision.
4. When it is done, call
   `mcp__plugin_production-master_production-master__get_report` and present
   the report.

If a call fails with an authentication error, tell the user to run
`/production-master:setup`. Report any other error as returned.
