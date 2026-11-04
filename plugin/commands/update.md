---
description: Send a scoped tool update (approve/act) to an in-flight Production Master investigation.
argument-hint: "<investigationId> <tool> [jsonArgs]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs update:*)
---

Relay a scoped update to investigation **$ARGUMENTS**.

`update` forwards a single tool invocation to the hosted service over the
authenticated MCP session; the service decides what it does. This client only
transports the request. Run `/login` first if you are not authenticated.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs" update $ARGUMENTS
```
