# Production Master — Claude Code plugin

Thin client for the [Production Master](https://github.com/ProductionMasterAI/production-master)
hosted incident-investigation service. Start an investigation, follow its
progress, read the report, and act on proposed changes — all from inside
Claude Code. **Nothing runs on your machine**: every run executes on the hosted
service, and this plugin only connects Claude Code to it.

## Install

```text
/plugin marketplace add ProductionMasterAI/production-master
/plugin install production-master@production-master
```

Claude Code asks for a **Production Master access token** when you install or
enable the plugin. Create one in the Production Master console under Settings,
then Access tokens. Claude Code keeps it in your OS credential store and sends
it only to the Production Master service. Run `/production-master:setup` for
step-by-step help.

## Commands

| Command | What it does |
|---|---|
| `/production-master:setup` | Set up, change or remove your access token |
| `/production-master:investigate <ticket or description>` | Start a run on the hosted service and follow it to its report |
| `/production-master:connect <investigationId>` | Re-attach to an in-flight or finished run |
| `/production-master:update <investigationId> <what to do>` | Review proposed actions, add evidence, correct a finding, or comment |

## How it works

The plugin declares one remote MCP server, `production-master`, at
`https://api.productionmaster.dev/v1/mcp`, and sends your access token to it as
a bearer token. The commands are instructions that tell Claude which of that
server's tools to call. The plugin contains no scripts or programs, installs no
packages, pre-approves no tools (Claude asks before each call), and reads
nothing from your environment.

## What's in this folder

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Manifest: the remote MCP server and the access-token setting |
| `commands/` | The four slash commands |
| `assets/` | The listing icon |

Source, tests, and full documentation live in the
[repository root](https://github.com/ProductionMasterAI/production-master).
License: [MIT](LICENSE).
