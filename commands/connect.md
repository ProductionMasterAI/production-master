---
description: Re-attach to an in-flight or completed Production Master investigation and stream its progress/report into the editor.
argument-hint: "<investigationId>"
allowed-tools: Bash
---

Re-attach to investigation **$ARGUMENTS** and stream it to completion.

`connect` seeds projections from the durable replay slice, then follows the live
stream — the same fold/render path `investigate` uses, so nothing is
re-computed locally. Run `/login` first if you are not authenticated.

```bash
set -euo pipefail
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
CLI="${PLUGIN_ROOT}/packages/adapter-claude-code/dist/cli.js"
[ -f "$CLI" ] || CLI="${PLUGIN_ROOT}/dist/cli.js"
export PM_SERVICE_URL="${PM_SERVICE_URL:-https://api.productionmaster.ai}"
node "$CLI" connect $ARGUMENTS
```
