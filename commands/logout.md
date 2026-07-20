---
description: Clear the stored Production Master session from your OS keychain.
argument-hint: "[--service <url>]"
allowed-tools: Bash
---

Log out of the Production Master hosted service and remove the stored session.

```bash
set -euo pipefail
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
CLI="${PLUGIN_ROOT}/packages/adapter-claude-code/dist/cli.js"
[ -f "$CLI" ] || CLI="${PLUGIN_ROOT}/dist/cli.js"
export PM_SERVICE_URL="${PM_SERVICE_URL:-https://api.productionmaster.ai}"
node "$CLI" logout $ARGUMENTS
```
