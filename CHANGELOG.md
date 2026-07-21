# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Docs: adapter status corrected to runnable.** README status badges now read
  `wired` (Claude Code) and `runnable` (Cursor / Codex / OpenCode) instead of the
  stale `pending`, and `docs/user/platform-support.md` states that all four adapters
  ship a runnable `dist/cli.js` today — while keeping the `Validated against`
  columns `pending`, since editor-version validation is a separate, still-pending
  axis. Removed the stale "once packages land" note from the README prerequisites.

### Added

- **Codex adapter now runnable**: `packages/adapter-codex` ships a `dist/cli.js`
  binary (mirroring `adapter-claude-code`'s CLI) with `bin` wired in `package.json`.
  It supports direct dispatch (`login`/`investigate`/`connect`/`update`/`logout`)
  plus a persistent `mcp` subcommand — a newline-delimited JSON-RPC/stdio MCP tool
  server (`initialize`/`tools/list`/`tools/call`) that forwards every call into the
  same `runtime.update()` path direct dispatch uses. `.codex/config.toml`'s
  `[mcp_servers.production-master]` block is uncommented and points at it.
- **Cursor and OpenCode adapters now runnable**: `packages/adapter-cursor` and
  `packages/adapter-opencode` each ship a `dist/cli.js` binary (mirroring the Codex
  adapter) with `bin` wired in `package.json` — direct dispatch plus the persistent
  `mcp` JSON-RPC/stdio server. Their registration files are populated to spawn it:
  `.cursor/mcp.json`'s `mcpServers.production-master` and `opencode.json`'s `mcp`
  map (a `type: "local"` entry). All four IDE adapters now have a runnable entry point.
- **Thin-client runtime** ported into `packages/*` (AD-7 single-path). `plugin-core`
  is the host-neutral core — `createPluginRuntime` composition root, device-code
  (RFC 8628) auth + OS-keychain token store, MCP session/tool surface over the
  service's Streamable-HTTP gateway, SSE event stream, projection fold → `PanelView`
  rendering, and the `RemoteServiceRunner` streaming engine. Exactly one runtime path
  (no local/inline mode); imports no LLM/provider SDK.
- **Per-IDE adapters** as `packages/adapter-{claude-code,cursor,codex,opencode}`, each
  a thin `HostAdapter` over the core. Claude Code additionally ships a runnable CLI
  and is wired end-to-end.
- **Claude Code install layer**: `.claude-plugin/plugin.json` manifest and `commands/`
  slash commands (`/login`, `/investigate`, `/connect`, `/update`, `/logout`) that exec
  the built thin-client binary. Cursor/Codex/OpenCode register through their own config
  files (`.cursor/mcp.json`, `.codex/config.toml`, `opencode.json`), which spawn each
  adapter's `mcp` server.
- TypeScript project references so `npm run build` compiles the core before the
  adapters that depend on it.
- Gemini PR reviewer (replaces Copilot reviews): a non-gating
  `.github/workflows/gemini-review.yml` + `scripts/gemini-review.mjs` that posts a
  single automated PR review from Vertex AI Gemini 2.5 Pro, authenticated keylessly
  via Workload Identity Federation (GCP credits — no stored key, no new secret). Any
  auth/API error becomes a workflow warning and exits 0, so it can never fail a PR.
  Public-repo hardened: runs only on `ubuntu-latest` (never self-hosted) and only for
  same-repo PRs, so a fork PR never reaches the WIF token or repo secrets.

## [0.1.0] - 2026-07-13

### Added

- Initial repository scaffold: README, documentation tree, contributing guide, and CI.
- Documented the thin-client-over-hosted-service architecture.
- Empty npm workspaces layout (`packages/*`) ready to be populated.

[Unreleased]: https://github.com/ProductionMasterAI/production-master/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ProductionMasterAI/production-master/releases/tag/v0.1.0
