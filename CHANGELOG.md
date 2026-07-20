# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
  the built thin-client binary. Cursor/Codex/OpenCode ship config stubs
  (`.cursor/mcp.json`, `.codex/config.toml`, `opencode.json`) pending their runnable
  entry points.
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
