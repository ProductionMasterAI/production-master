# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | 2.1.224 |
| Cursor | 3.11 | 3.11 (+ changelog 2026-08-03) |
| Codex | pending | pending |
| OpenCode | pending | pending |

Root pin for Cursor: [`.cursor-version`](../../.cursor-version).

All four adapter packages now ship a runnable `dist/cli.js`, so each client is
usable today. Claude Code / Codex / OpenCode `Validated against` columns stay
`pending` because they track testing against a specific released editor version —
a separate axis from the adapter code landing. The Claude Code release this
repo currently targets is tracked in [`.claude-code-version`](../../.claude-code-version)
at the repo root and mirrored in the `Latest known` column above.

**Cursor notes (3.11 → 2026-08-03).** Registration remains `.cursor/mcp.json` →
`mcpServers.production-master` (see [Quick Start](quick-start.md)). Cursor 3.9+'s
Customize page is the preferred place to manage that MCP entry alongside plugins,
skills, and hooks. Team admins on 3.10+ can also distribute an approved MCP via
**Team MCPs in team marketplaces** (Dashboard → Integrations & MCP) so members
install the same server without hand-editing JSON. Optional Google Workspace
marketplace plugins (2026-08-03) are unrelated to this thin client and are not
required for investigations.

**Cursor working tips.** Use a **side chat** (`/side`, `/btw`, 3.11) to debug MCP
registration or compare adapter shapes without interrupting an in-flight
investigation. **Cursor Automations** (3.8, `/automate`) can watch **Workflow run
completed** on this repo's CI and open a fix PR; enable computer use when you want
a demo artifact attached. Prefer **Balance** Auto / Cursor Router mode for routine
adapter work.

**Runnable status (all four adapters).** Each adapter ships direct dispatch
(`login`/`investigate`/`connect`/`update`/`logout`, the same CLI shape across
adapters) and a persistent `mcp` subcommand — a JSON-RPC/stdio MCP tool server —
wired into that editor's native registration:

| Adapter | Registration file | `mcp` entry point |
|---|---|---|
| `adapter-claude-code` | `.claude-plugin/plugin.json` + `commands/` | wired end-to-end (slash commands) |
| `adapter-cursor` | `.cursor/mcp.json` → `mcpServers.production-master` | `dist/cli.js mcp` |
| `adapter-codex` | `.codex/config.toml` → `[mcp_servers.production-master]` | `dist/cli.js mcp` |
| `adapter-opencode` | `opencode.json` → `mcp.production-master` | `dist/cli.js mcp` |
