# Production Master — Claude Code plugin

Thin client for the [Production Master](https://github.com/ProductionMasterAI/production-master)
hosted incident-investigation service. Log in once, trigger an investigation,
stream its live progress, and approve or reject proposed actions — all from
inside Claude Code. **No investigation logic runs locally**: every run executes
on the hosted service.

## Install

```text
/plugin marketplace add ProductionMasterAI/production-master
/plugin install production-master@production-master
```

## Commands

| Command | What it does |
|---|---|
| `/production-master:login [--service <url>]` | Device-code (RFC 8628) login; the session is stored in your OS keychain |
| `/production-master:investigate <ticket or description>` | Start a run on the hosted service and stream its progress |
| `/production-master:connect <investigationId>` | Re-attach to an in-flight or finished run |
| `/production-master:update <investigationId> <tool> [jsonArgs]` | Send a scoped approve/act update to a run |
| `/production-master:logout [--service <url>]` | Remove the stored session from your keychain |

Each command runs one file shipped in this folder,
[`bin/production-master.mjs`](bin/production-master.mjs), with Node.js 22+, and
pre-approves only that file's own subcommand. The plugin installs no packages,
downloads nothing at install or run time, and reads no credentials from your
environment — the only credential it uses is the session `/login` stores in
your keychain, sent only to the Production Master service.

`--service <url>` points `login`/`logout` at a self-hosted service; the default
is the public hosted service.

## What's in this folder

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest |
| `commands/` | The five slash commands |
| `bin/production-master.mjs` | The thin-client runtime — a readable, generated bundle of [`packages/adapter-claude-code`](../packages/adapter-claude-code) and [`packages/plugin-core`](../packages/plugin-core); rebuild with `npm run build:plugin` |
| `assets/icon.png` | Listing icon |

Source, tests, and full documentation live in the
[repository root](https://github.com/ProductionMasterAI/production-master).
License: [MIT](LICENSE).
