---
description: Re-attach to an in-flight or completed Production Master investigation and stream its progress/report into the editor.
argument-hint: "<investigationId>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs connect:*)
---

Re-attach to investigation **$ARGUMENTS** and stream it to completion.

`connect` seeds projections from the durable replay slice, then follows the live
stream — the same fold/render path `investigate` uses, so nothing is
re-computed locally. Run `/login` first if you are not authenticated.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs" connect $ARGUMENTS
```
