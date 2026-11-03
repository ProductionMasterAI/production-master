---
description: Authenticate with the Production Master hosted service via device-code (RFC 8628) login and store the session in your OS keychain.
argument-hint: "[--service <url>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs login:*)
---

Authenticate this editor with the Production Master hosted service.

Login is delegated to the thin-client binary — the same `createPluginRuntime`
composition root every command uses — so the session is stored exactly where
`/investigate` later reads it (the OS keychain). The binary opens the
verification URL, polls to completion, and persists the encrypted session. No
investigation logic runs locally.

Run this to log in (pass `--service <url>` to point at a self-hosted service;
otherwise it uses the public hosted service):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/production-master.mjs" login $ARGUMENTS
```
