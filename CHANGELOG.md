# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Claude Code target bumped to 2.1.226** (from 2.1.224) in `.claude-code-version`
  and `docs/user/platform-support.md`. The 2.1.225 + 2.1.226 delta is fix-only from
  this plugin's perspective: 2.1.226 ships only "bug fixes and reliability
  improvements", and 2.1.225's one client-relevant fix — a transient 401 replacing a
  long-lived `CLAUDE_CODE_OAUTH_TOKEN` with a short-lived stored-login token,
  breaking headless sessions until restart — is now covered in troubleshooting's
  headless notes, since in a CI job that triggers investigations it presented as the
  run's auth "going bad" mid-flight and read like a `PM_ACCESS_TOKEN` problem. The
  rest of the 2.1.225 delta (gateway spend-limit warnings, a `claude agents`
  workspace-trust prompt, macOS MCP-OAuth keychain 401 bursts, Remote Control and
  cross-session messaging fixes) is host-side, touches no flow this client
  documents, and needs no client change; the sandbox guidance and adapter
  registration files are unaffected.

- **Claude Code target bumped to 2.1.224** (from 2.1.223) in `.claude-code-version`
  and `docs/user/platform-support.md`. Doc updates for the 2.1.224 delta, all in
  existing sections: troubleshooting's strict-allowlist note records that from
  2.1.224 sandbox violation details appear in Bash tool results (the denied host
  or file is named instead of a bare connection error); the credential-file
  masking bullet notes 2.1.224's structured masking options
  (`extract`/`onExtractNoMatch`, and `decode: "jwt"` with `maskClaims` for JWT
  credentials), which require `network.tlsTerminate` and are honored only from
  user, managed, or `--settings` settings; a new sandbox note records that
  filesystem deny entries written with a trailing slash (e.g. `denyRead:
  "~/.pm-credentials/"`) were silently bypassable on Linux/macOS before 2.1.224 (update,
  then keep the entries as written); MCP-registration troubleshooting notes
  2.1.224's fix for plugin install records silently corrupting when the same
  plugin is installed in multiple projects, and its fix for MCP tools that
  connect mid-turn being deferred for tool search without their names announced;
  and the quick-start Claude Code section and README mention the new `archive`
  plugin source (zip over HTTPS, optional SHA-256 pinning) as an install channel
  for environments without git or npm. The rest of the delta (self-hosted
  runners, cross-session `SendMessage`/`ListAgents`,
  `crossSessionInbound`/`dialogExpiry`, the removed 200-subagent-per-session
  cap, Remote Control, Bedrock, and paste/UI changes) is host-side, unreferenced
  in this repo, and needs no client change; this repo's `.claude/settings.json`
  carries no sandbox filesystem deny entries, so the trailing-slash fix requires
  no config change here.

- **Claude Code target bumped to 2.1.223** (from 2.1.222) in `.claude-code-version`
  and `docs/user/platform-support.md`. The 2.1.223 delta is fix-only from this
  plugin's perspective — its permission-hardening (Bash permission bypass,
  invisible-Unicode prompt spoofing) and workflow-sandbox fixes land host-side
  and need no client change; the `/review` → `/code-review` consolidation is
  unreferenced here. One user-facing note added: troubleshooting's sandbox
  section now records that sandboxed commands failing to start on Linux when
  `sandbox.filesystem.denyWrite` covers the working directory is a bug fixed in
  2.1.223 (update, don't loosen the deny rule) — the third failure mode in that
  section with a version answer rather than a configuration answer.

- **Claude Code target bumped to 2.1.222** (from 2.1.220) in `.claude-code-version`
  and `docs/user/platform-support.md`. Docs updated for the 2.1.221 delta:
  troubleshooting notes that TLS errors on large sandboxed uploads through the
  sandbox proxy are fixed (update, don't re-configure), documents `mode: "mask"`
  credential-file masking for headless setups that seed `PM_ACCESS_TOKEN` from a
  file (Linux/WSL), and the quick-start/MCP-registration reload guidance reflects
  that `/plugin install` activates plugins immediately when safe on 2.1.221+.
  The 2.1.222 delta was reviewed and is fix-only from this plugin's perspective
  (worktree/hook/permission hardening, `/usage` MCP attribution); the plugin
  manifest, command frontmatter, and documented flows need no changes, and the
  repo references no removed features (`ultraplan` removal does not affect it).

### Added

- **Troubleshooting: sandboxed-command network failures (Claude Code 2.1.219).**
  New "Sandboxed commands" section in `docs/user/troubleshooting.md`: with
  `sandbox.network.strictAllowlist` enabled, sandboxed Bash commands fail on
  non-allowlisted hosts *without prompting*, which surfaces as bare connection
  errors when the thin client calls the hosted service. Documents allowlisting
  `api.productionmaster.ai` (or the custom `PM_SERVICE_URL` host).
- **`.claude-code-version` — tracked Claude Code target release (2.1.220).** New
  root file recording the latest Claude Code release this repo targets, so
  version-support updates are diffable and automatable. `docs/user/platform-support.md`
  now mirrors it in the Claude Code `Latest known` column and links to the file.
  Reviewed the Claude Code 2.0.0 → 2.1.220 changelog for plugin-facing changes:
  the plugin manifest (`.claude-plugin/plugin.json`) and command frontmatter
  (`allowed-tools`, `argument-hint`) remain valid, and the repo relies on no
  removed or deprecated features. `Validated against` stays `pending` — editor-version
  validation remains a separate axis.

### Changed

- **Docs: adapter status corrected to runnable.** README status badges now read
  `wired` (Claude Code) and `runnable` (Cursor / Codex / OpenCode) instead of the
  stale `pending`, and `docs/user/platform-support.md` states that all four adapters
  ship a runnable `dist/cli.js` today — while keeping the `Validated against`
  columns `pending`, since editor-version validation is a separate, still-pending
  axis. Removed the stale "once packages land" note from the README prerequisites.

### Added

- **CI test-coverage gate.** The suite now runs under vitest v8 coverage
  (`npm run test:coverage`) and the `CI` job fails on a threshold breach. Initial
  rise-only floors sit just below the measured baseline — statements/lines 78%,
  branches 68%, functions 84% — so the gate catches regressions and coverage
  erosion (notably in the thin per-IDE adapters) without a backfill. Type/index
  barrels, fixtures, and test files are excluded from the denominator. Policy is
  documented in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).
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
