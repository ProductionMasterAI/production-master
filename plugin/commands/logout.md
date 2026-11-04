---
description: Clear the stored Production Master session from your OS keychain.
argument-hint: "[--service <url>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs logout:*)
---

Log out of the Production Master hosted service and remove the stored session.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs" logout $ARGUMENTS
```
