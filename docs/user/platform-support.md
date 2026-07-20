# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | pending |
| Cursor | pending | pending |
| Codex | pending | pending |
| OpenCode | pending | pending |

All targets are `pending` while the client packages are still landing. As each host
adapter ships, its entry is updated with the platform version it was tested against.

**Codex** — `adapter-codex` now ships a runnable `dist/cli.js`: direct dispatch
(`login`/`investigate`/`connect`/`update`/`logout`, the same shape Claude Code's CLI
uses) plus a persistent `mcp` subcommand that `.codex/config.toml`'s
`[mcp_servers.production-master]` block spawns as a JSON-RPC/stdio MCP tool server.
The "validated against" column above still tracks real Codex CLI version testing,
which is separate from — and still pending after — this code landing.
