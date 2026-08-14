# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | 2.1.232 |
| Cursor | pending | 3.11 (+ changelog 2026-08-03) |
| Codex | pending | 0.147.0 |
| OpenCode | pending | pending |

All four adapter packages now ship a runnable `dist/cli.js`, so each client is
usable today. The Codex release this repo targets is **0.147.0** and the Cursor
release is **3.11** (changelog covered through 2026-08-03; desktop CLI observed at **3.15.19**): for each, the
compatibility delta was reviewed against the existing adapter and its registration
shape (`.codex/config.toml` for Codex, `.cursor/mcp.json` for Cursor), and nothing
in either requires a client change. That is a documentation review, not a host
test — `Validated against` stays `pending` for both, as it does for every platform,
because running the adapter end-to-end against a released host is a separate axis
that no target has cleared yet. The tracked pins live at the repo root:
[`.claude-code-version`](../../.claude-code-version),
[`.codex-version`](../../.codex-version), and
[`.cursor-version`](../../.cursor-version).

Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol. Production Master's current
stdio server intentionally continues to advertise its older supported MCP
protocol; changing only the protocol string would be unsafe. A future SDK-backed
upgrade should adopt the newer protocol when paginated discovery, multi-round
requests, and non-blocking startup can be implemented and tested together.

**Claude Code notes (2.1.231 → 2.1.232).** Registration is unchanged. Two
2.1.232 entries improve this plugin's install story with no client change:
`/plugin install production-master@<marketplace>` now **refreshes the
marketplace first**, so a just-published plugin version installs without a
manual `marketplace update` (quick-start and troubleshooting note the
version-scoped behavior), and a startup race that could silently unregister a
plugin marketplace (concurrent `known_marketplaces.json` writes) is fixed — a
"marketplace disappeared" symptom on older versions is a host bug, not a
registration mistake. For managed environments, `allowedMarketplaces` /
`additionalMarketplaces` are accepted as friendlier aliases for
`strictKnownMarketplaces` / `extraKnownMarketplaces`, and marketplaces can now
be hosted on GitLab (bare `gitlab.com` repo URLs). The rest of the delta is
host-side and needs no client change: session `@`-mentions and subagent
forking defaults, GitLab token redaction, Remote Control and gateway fixes,
and the MCP protocol-version-probe fix (this client's Claude Code path
registers via `/plugin install`, not MCP; the other editors' MCP registrations
talk to their own hosts, not Claude Code's MCP client).

**Claude Code notes (2.1.229 → 2.1.231).** Registration remains
`.claude-plugin/plugin.json` + `commands/` (see the table below). Since Claude
Code 2.1.229, plugin marketplaces also support **`command` sources**: a local
command prints the plugin directory, the result is re-resolved each session and
applied without a restart, and `mode: "link"` uses the directory in place. For
contributors hacking on `adapter-claude-code`, that is the cleanest local-dev
install — register the dev checkout through a command-source marketplace entry
and each new session picks up the checkout as it stands (the slash commands
still exec the built `dist/cli.js`, so run `npm run build` after edits). The
rest of the 2.1.229 + 2.1.231 delta is host-side and needs no client change:
both releases' MCP OAuth fixes concern OAuth-flow MCP servers, while this
client's device-code + bearer design never touches MCP OAuth.

**Cursor notes (3.11 → 2026-08-03).** Registration remains `.cursor/mcp.json` →
`mcpServers.production-master` (see [Quick Start](quick-start.md)). Cursor 3.9+'s
Customize page is the preferred place to manage that MCP entry alongside plugins,
skills, and hooks. Team admins on 3.10+ can also distribute an approved MCP via
**Team MCPs in team marketplaces** (Dashboard → Integrations & MCP) so members
install the same server without hand-editing JSON. Optional Google Workspace
marketplace plugins (2026-08-03) are unrelated to this thin client and are not
required for investigations.

**Cursor working tips.** Desktop CLI may report **3.15.19** while the public feature
changelog stays on **3.11** — this repo pins the feature/date in `.cursor-version`
and records `desktop_cli` separately. Cursor also loads the open
[Agent Plugins](https://agent-plugins.org) standard alongside `.cursor-plugin`
manifests. The desktop/CLI `workspaceOpen` hook can return `pluginPaths` for
workspace-specific plugins (not available on Cloud Agents). Use a **side chat**
(`/side`, `/btw`, 3.11) to debug MCP registration or compare adapter shapes without
interrupting an in-flight investigation. **Cursor Automations** (3.8, `/automate`)
can **delete memory files** from the UI (or when prompted) and can watch **Workflow run completed** on this repo's CI and open a fix PR; enable
computer use when you want a demo artifact attached. Prefer **Balance** Auto /
Cursor Router mode for routine adapter work. **Inbox multi-PR sessions
(2026-07-29):** when one chat opens several adapter/docs PRs, open every PR from
the session — not only the last.

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
