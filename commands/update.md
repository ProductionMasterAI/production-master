---
description: Send a scoped tool update (approve/act) to an in-flight Production Master investigation.
argument-hint: "<investigationId> <tool> [jsonArgs]"
allowed-tools: Bash
---

Relay a scoped update to investigation **$ARGUMENTS**.

`update` forwards a single tool invocation to the hosted service over the
authenticated MCP session; the service decides what it does. This client only
transports the request. Run `/login` first if you are not authenticated.

```bash
set -euo pipefail
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
CLI="${PLUGIN_ROOT}/packages/adapter-claude-code/dist/cli.js"
[ -f "$CLI" ] || CLI="${PLUGIN_ROOT}/dist/cli.js"
export PM_SERVICE_URL="${PM_SERVICE_URL:-https://api.productionmaster.ai}"
node "$CLI" update $ARGUMENTS
```
