---
description: Revoke your Production Master login on the service and clear it from your OS keychain.
argument-hint: "[--service <url>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs logout:*)
---

Log out of the Production Master hosted service: revoke the login on the service and remove the stored session. The local session is removed even if the service cannot be reached.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs" logout $ARGUMENTS
```
