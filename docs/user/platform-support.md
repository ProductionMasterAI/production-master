# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | 2.1.224 |
| Cursor | pending | pending |
| Codex | 0.147.0 | 0.147.0 |
| OpenCode | pending | pending |

All four adapter packages now ship a runnable `dist/cli.js`, so each client is
usable today. Codex is validated against **0.147.0** by reviewing that release's
compatibility delta against the existing adapter, `.codex/config.toml`, and MCP
registration. The other `Validated against` entries remain `pending` because
those targets are maintained independently. The Claude Code release this repo
currently targets is tracked in [`.claude-code-version`](../../.claude-code-version);
Codex is tracked in [`.codex-version`](../../.codex-version).

Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol. Production Master's current
stdio server intentionally continues to advertise its older supported MCP
protocol; changing only the protocol string would be unsafe. A future SDK-backed
upgrade should adopt the newer protocol when paginated discovery, multi-round
requests, and non-blocking startup can be implemented and tested together.

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
