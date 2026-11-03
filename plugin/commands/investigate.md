---
description: Start a Production Master investigation on the hosted service and stream live progress into the editor. The investigation runs entirely server-side.
argument-hint: "[JIRA-TICKET or bug description]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs investigate:*)
---

Trigger an investigation for: **$ARGUMENTS**

The run executes entirely on the Production Master hosted service. This command
only authenticates, triggers the run, streams live progress, renders the report,
and relays any approve/reject decisions — no analysis happens locally. If you are
not logged in, run `/login` first.

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs investigate --input "$ARGUMENTS"
```
