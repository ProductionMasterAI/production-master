# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`pmctl` operator CLI (dev#268).** New `packages/pmctl` workspace package — a
  standalone thin-client binary (`login`, `start`, `status`, `report`, `events`,
  `approve`, `reject`) over the same BFF and `@production-master/plugin-core` as every
  editor adapter, for scripting and CI use outside an IDE. Ported from the archived
  personal prototype, with the entry-point detection fixed to compare realpaths so the
  binary works when invoked through its real npm-installed symlink (the original
  string comparison silently produced a no-op CLI in that case).

### Changed

- **Cursor currency (desktop 3.15.19; Automations memory-file delete noted).** `.cursor-version` keeps feature **3.11** / changelog **2026-08-03** and records `desktop_cli: 3.15.19`. Docs note Agent Plugins standard support and the desktop `workspaceOpen` hook (`pluginPaths`).

### Security

- **Canonical API host is now `api.productionmaster.dev`, not
  `api.productionmaster.ai` (dev#468).** Every editor registration, slash
  command, and doc in this repo defaulted `PM_SERVICE_URL` to
  `https://api.productionmaster.ai` — a hostname whose apex, `productionmaster.ai`,
  is **not registered by us and is available to buy**. Anyone who registered it
  would receive the bearer token of every user who never set `PM_SERVICE_URL`.
  The default now points at a subdomain of `productionmaster.dev`, which we do
  own, so the name cannot be claimed by a third party. A second unregistered
  vanity host, `mcp.productionmaster.ai`, was found in the BFF test fixture and
  moved the same way. The 2.1.219 troubleshooting note that told users to
  allowlist the old hostname was corrected in place rather than left standing,
  since following it would firewall-allow a domain we do not control.
  **Note:** `api.productionmaster.dev` has no DNS record yet, so the default is
  inert until one is added — the same as before this change, but no longer
  hijackable. The Python SDK's `DEFAULT_SERVICE_URL` deliberately stays on the
  service's Vercel origin, which resolves today; it flips once the vanity host
  serves the BFF.

### Added

- **Python SDK (`sdk/python`) — a pure-stdlib thin client for scripting and CI.**
  `Client.start_investigation` → `stream_events` (SSE with `Last-Event-ID` resume)
  → `get_report`, plus the same RFC 8628 device-code login the editors use.
  Zero runtime dependencies, so `pip install` pulls nothing third-party. It is a
  thin client like every other surface: it marshals requests, attaches a stable
  `Idempotency-Key` on mutations, and maps errors — no analysis logic, no LLM SDK.
  The projection reducer is pinned against the TypeScript one by
  `tests/fixtures/sse/expected-projection.json`, asserted from both languages, so
  the two cannot silently diverge. CI gains a `python-sdk` job (3.9 and 3.13) and
  the `no-llm-sdk` guard — previously scanning only JS/TS file types — now covers
  Python source and Python manifests. Publishing is wired but dormant:
  `.github/workflows/publish-python.yml` fires on a `python-v*` tag and uses PyPI
  Trusted Publishing (OIDC), so no long-lived `PYPI_API_TOKEN` is stored here.
- **`PM_SERVICE_URL` is honoured by the Python SDK**, matching every editor
  registration in this repo: explicit `service_url=` beats the variable, which
  beats the built-in default.

- **`.codex-version` — tracked Codex target release (0.147.0).** New root file
  recording the latest Codex release this repo targets, mirroring
  `.claude-code-version`, so version-support updates are diffable and automatable.
  `docs/user/platform-support.md` mirrors it in the Codex `Latest known` column and
  links to the file. Reviewed the 0.147.0 compatibility delta against the existing
  adapter, `.codex/config.toml`, and MCP registration: no client change is required.
  Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol, which the stdio server
  intentionally does not adopt yet — advertising the newer protocol string alone
  would be unsafe without paginated discovery, multi-round requests, and
  non-blocking startup. `Validated against` stays `pending`: a compatibility review
  is not an end-to-end host test, and host-version validation remains a separate axis.

### Changed

- **Cursor target pinned to 3.11** (changelog covered through **2026-08-03**) via
  new root [`.cursor-version`](.cursor-version). The 3.11 delta was reviewed against
  the existing adapter and the `.cursor/mcp.json` registration shape and needs no
  client change, so `docs/user/platform-support.md` records 3.11 under
  `Latest known` while Cursor's `Validated against` stays `pending` — that column
  tracks an end-to-end test against a released host, which no platform has cleared.
  The same doc now covers Customize-page MCP management (3.9+), Team MCP
  marketplace distribution (3.10+), and that Google Workspace plugins (2026-08-03)
  are optional and unrelated to this thin client. Quick Start's Cursor section
  points at Customize + the Team MCP path.
- **Cursor working tips** — side chats (3.11) for MCP debugging without interrupting
  an investigation; Cursor Automations (3.8, `/automate`) for **Workflow run
  completed** CI triage; Balance Auto / Cursor Router for routine adapter work;
  Inbox **multi-PR sessions** (2026-07-29) when one chat opens several PRs.
- **Claude Code target bumped to 2.1.231** (from 2.1.228) in `.claude-code-version`
  and `docs/user/platform-support.md`. The 2.1.229 + 2.1.231 delta (no 2.1.230 entry
  was published) is fix-heavy from this plugin's perspective, with one adoptable
  capability: **plugin marketplace `command` sources** (2.1.229) — a local command
  prints the plugin directory, re-resolved each session and applied without a
  restart, with `mode: "link"` using the directory in place. Documented in
  `platform-support.md` as the recommended local-dev install for
  `adapter-claude-code` contributors (a linked dev checkout replaces the
  reinstall-after-every-edit loop; the built `dist/cli.js` is still required).
  Reviewed and not applicable: both releases' MCP OAuth fixes (127.0.0.1 redirect
  URIs, pre-registered OAuth clients) concern OAuth-flow MCP servers — this
  client's device-code + bearer design never touches MCP OAuth; the 2.1.231
  `/install-github-app` review-workflow fix does not affect
  `.github/workflows/claude.yml`, which is the mention-gated workflow, not the
  generated review workflow; and the `/commit-push-pr` change (dangerous git/gh
  flags no longer auto-approved) plus SSE keepalives on Vertex/Bedrock gateway
  streaming are host-side. Nothing in the delta touches the adapter registration
  shapes or the SSE streaming contract this client implements against the
  Production Master service.

- **Claude Code target bumped to 2.1.228** (from 2.1.226) in `.claude-code-version`
  and `docs/user/platform-support.md`. The 2.1.227 + 2.1.228 delta is fix-only from
  this plugin's perspective. The one entry naming a surface this repo actually runs —
  2.1.227 fixes every Bash command failing under `claude-code-action` when
  `allowed_non_write_users` is set on GitHub-hosted runners — does not affect
  `.github/workflows/claude.yml`, which runs on GitHub-hosted runners but gates by
  author association and never sets that input, so no workflow change is needed.
  2.1.227's slash-command menu polish (selection highlight, bolded matches,
  emoji/accented names keep their glyphs) is host UI that this plugin's
  `/login`/`/investigate`/`/connect`/`/update`/`/logout` commands simply inherit. The
  rest of the delta (self-hosted-runner and Remote Control fixes, cross-session
  messaging display, Vertex AI credential fail-fast, a Write-tool rule change for
  newer models, compaction-progress UI) is host-side, touches no flow this client
  documents, and needs no client change; the sandbox guidance and adapter
  registration files are unaffected.

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
  non-allowlisted hosts _without prompting_, which surfaces as bare connection
  errors when the thin client calls the hosted service. Documents allowlisting
  `api.productionmaster.dev` (or the custom `PM_SERVICE_URL` host).
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
