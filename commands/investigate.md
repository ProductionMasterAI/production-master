---
description: Start a Production Master investigation on the hosted service and stream live progress into the editor. The investigation runs entirely server-side.
argument-hint: "[JIRA-TICKET or bug description]"
allowed-tools: Bash
---

Trigger an investigation for: **$ARGUMENTS**

The run executes entirely on the Production Master hosted service. This command
only authenticates, triggers the run, streams live progress, renders the report,
and relays any approve/reject decisions — no analysis happens locally. If you are
not logged in, run `/login` first.

```bash
set -euo pipefail
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
CLI="${PLUGIN_ROOT}/packages/adapter-claude-code/dist/cli.js"
[ -f "$CLI" ] || CLI="${PLUGIN_ROOT}/dist/cli.js"
export PM_SERVICE_URL="${PM_SERVICE_URL:-https://api.productionmaster.ai}"
node "$CLI" investigate --input "$ARGUMENTS"
```
