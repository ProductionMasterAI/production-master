---
description: Authenticate with the Production Master hosted service via device-code (RFC 8628) login and store the session in your OS keychain.
argument-hint: "[--service <url>]"
allowed-tools: Bash
---

Authenticate this editor with the Production Master hosted service.

Login is delegated to the thin-client binary — the same `createPluginRuntime`
composition root every command uses — so the session is stored exactly where
`/investigate` later reads it (the OS keychain). The binary opens the
verification URL, polls to completion, and persists the encrypted session. No
investigation logic runs locally.

Run this to log in (pass `--service <url>` to override; otherwise it uses
`$PM_SERVICE_URL` or the public default):

```bash
set -euo pipefail
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
CLI="${PLUGIN_ROOT}/packages/adapter-claude-code/dist/cli.js"
[ -f "$CLI" ] || CLI="${PLUGIN_ROOT}/dist/cli.js"
export PM_SERVICE_URL="${PM_SERVICE_URL:-https://api.productionmaster.ai}"
node "$CLI" login $ARGUMENTS
```
