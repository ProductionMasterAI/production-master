# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pin↔doc guard + changelog structure lint, wired into the required `CI`
  job (dev#726).** `scripts/check-version-pin-docs.mjs` asserts the root pin
  files (`.claude-code-version`, `.codex-version`, `.cursor-version`) and
  `docs/user/platform-support.md` agree pairwise, per pin — a value present
  in the doc but attached to the wrong pin's row now fails instead of
  passing a presence-only check (dev#718's swap failure mode).
  `scripts/check-changelog-structure.mjs` asserts every `## [Unreleased]`
  bullet sits under a Keep a Changelog category header (plugin#37's
  orphaned-bullet regression). Both run as steps in the `CI` job, the sole
  required status context on this repo's `main`.

### Fixed

- **`docs/user/platform-support.md` claimed Codex 0.147.0; the pin
  (`.codex-version`) has held 0.148.0 since #35.** The pin-doc guard added
  above caught this live drift on the current tree; the doc now reads
  0.148.0 in the platform table and the narrative paragraph.

## [0.1.1] - 2026-08-20

### Changed

- **First release cut on the OIDC publish path (dev#725).** `0.1.0` was tagged and
  published **before** the OIDC workflow change below merged, so that green Release run says
  nothing about trusted publishing — it went out on the old token path. npm refuses to
  republish an existing version, so the only way to exercise the new workflow is a
  genuinely new one; that is what this release is for. If OIDC is not configured
  correctly on npmjs.com the publish fails loudly rather than falling back, which is the
  outcome this version exists to establish.
- **Release workflow: publish to npm via OIDC trusted publishing (dev#725).**
  `.github/workflows/release.yml` gains `id-token: write` and a step that upgrades npm to
  the latest release and **asserts** it is >= 11.5.1 (npm's floor for trusted publishing)
  before `npm ci`; `.nvmrc`'s Node 22.15.0 already satisfies the Node floor and is
  unchanged. The publish steps no longer set `NODE_AUTH_TOKEN`: npm prefers OIDC and falls
  back to a token **silently**, so leaving the token wired would make a green publish
  indistinguishable from OIDC never engaging — the migration could never be verified.
  With no token, OIDC either works or the release fails loudly. Requires the trusted
  publisher to be configured on npmjs.com for both packages (owner step, done
  out-of-band); the `NPM_TOKEN` repo secret is deleted once a real tag release has
  published green.
- **Cursor 3.11 (+2026-08-19):** advance `changelog_date` **2026-08-17 → 2026-08-19** (desktop **3.16.29** unchanged). Document cloud-agent **Subscriptions**, **Custom Modes**, **isolated-VM subagents**, Agent Window **`/goal`**, and **non-interruptive steering**. Cursor-only; other platform nightlies untouched.
- **Claude Code currency (2.1.234 → 2.1.236).** `.claude-code-version` advances to
  **2.1.236**. Registration, sandboxing configuration shape, and command-argument
  handling are unchanged; the only client-relevant item is 2.1.236's hardening of
  macOS sandbox wildcard `denyRead` rules (now honored inside allowed read
  regions, covering matched directories' contents, and no longer bypassable by
  renaming the denied file) — closing the same sandboxed-file-protection bypass
  family as the 2.1.224 Linux/macOS trailing-slash fix and the 2.1.234 Windows
  NT-namespace-path fix. macOS users protecting a `PM_ACCESS_TOKEN` credentials
  file with a wildcard sandbox deny entry now get the same guarantee Linux
  already had. Everything else in the 2.1.235–2.1.236 range is host-side
  UI/perf/reliability work with no client-relevant surface. See
  [Platform support](docs/user/platform-support.md) for the full delta.
- **Claude Code currency (2.1.233 → 2.1.234).** `.claude-code-version` advances to
  **2.1.234**. Registration, sandboxing, and command-argument handling are
  unchanged; the only client-relevant item is 2.1.234's hardening against
  Windows NT-namespace path reads, which closes the same sandboxed-file-protection
  bypass family as the 2.1.224 Linux/macOS trailing-slash `denyRead` fix — Windows
  users protecting a `PM_ACCESS_TOKEN` credentials file with a sandbox deny entry
  now get the same guarantee. See [Platform support](docs/user/platform-support.md)
  for the full delta.
- **Cursor desktop 3.16.29 + Origin CLI/integrations:** re-pin desktop/`validated_against` **3.16.17 → 3.16.29** (stable download line 2026-08-18; no separate feature write-up). Document Origin CLI, agent-created Origin repos, and Origin↔Automations/Cloud Agents / apps integrations. Feature/date pins stay **3.11** / **2026-08-17**.
- **Cursor Origin + Builds default (2026-08-17).** Documented [Origin](https://cursor.com/docs/origin) (early-beta Cursor git forge; GitHub remains canonical for this public thin client) and flipped Cloud Agent Builds language to **now default**. Pin bump: `changelog_date` **2026-08-13 → 2026-08-17**; feature **3.11** / desktop **3.16.17** unchanged.

## [0.1.0] - 2026-08-20

First published release. Everything below accumulated pre-release, alongside
the initial scaffold from 2026-07-13 that never actually got tagged — `npm`
and PyPI have returned 404 for these package names until now (dev#642).

### Added

- **npm and PyPI packages published for the first time (dev#642).** `private:
true` removed from the publishable manifests; `packages/pmctl` now publishes
  unscoped as `production-master` (`npx production-master` runs the `pmctl`
  binary) and `packages/plugin-core` publishes as
  `@production-master/plugin-core`, both at `0.1.0`. `sdk/python` publishes to
  PyPI as `production-master`, also `0.1.0`. The four IDE adapter packages
  stay `private` — they ship through their own editor's install mechanism
  (Claude Code plugin marketplace / archive source, `.cursor/mcp.json`,
  `.codex/config.toml`, `opencode.json`), not via `npm install`.

### Added

- **`pmctl` operator CLI (dev#268).** New `packages/pmctl` workspace package — a
  standalone thin-client binary (`login`, `start`, `status`, `report`, `events`,
  `approve`, `reject`) over the same BFF and `@production-master/plugin-core` as every
  editor adapter, for scripting and CI use outside an IDE. Ported from the archived
  personal prototype, with the entry-point detection fixed to compare realpaths so the
  binary works when invoked through its real npm-installed symlink (the original
  string comparison silently produced a no-op CLI in that case).

### Changed

- **Claude Code currency (2.1.233 → 2.1.234).** `.claude-code-version` advances to
  **2.1.234**. Registration, sandboxing, and command-argument handling are
  unchanged; the only client-relevant item is 2.1.234's hardening against
  Windows NT-namespace path reads, which closes the same sandboxed-file-protection
  bypass family as the 2.1.224 Linux/macOS trailing-slash `denyRead` fix — Windows
  users protecting a `PM_ACCESS_TOKEN` credentials file with a sandbox deny entry
  now get the same guarantee. See [Platform support](docs/user/platform-support.md)
  for the full delta.
- **Cursor desktop 3.16.29 + Origin CLI/integrations:** re-pin desktop/`validated_against` **3.16.17 → 3.16.29** (stable download line 2026-08-18; no separate feature write-up). Document Origin CLI, agent-created Origin repos, and Origin↔Automations/Cloud Agents / apps integrations. Feature/date pins stay **3.11** / **2026-08-17**.
- **Cursor Origin + Builds default (2026-08-17).** Documented [Origin](https://cursor.com/docs/origin) (early-beta Cursor git forge; GitHub remains canonical for this public thin client) and flipped Cloud Agent Builds language to **now default**. Pin bump: `changelog_date` **2026-08-13 → 2026-08-17**; feature **3.11** / desktop **3.16.17** unchanged.
- **Cursor Grok 4.6 + Builds T-1 readiness (2026-08-16).** Platform support + Quick Start document Grok 4.6 for long-running / visual adapter work and a T-1 Builds checklist before the **2026-08-17** default. Pins stay **3.11** / **2026-08-13** / desktop **3.16.17**.

- **Cursor desktop 3.16.17 + Builds skipped/staleness docs.** Desktop pin **3.15.19 → 3.16.17**; docs cover Builds Skipped checks, 24h staleness default, and install/start/terminals. Feature/date pins stay **3.11** / **2026-08-13**.
- **Cursor Builds Aug-17 readiness + CLI steer/`/goal`.** Platform support + Quick Start deepen Builds adoption (enable now ahead of **2026-08-17** default; team/environment secrets; git-staleness) and note CLI steer + durable `/goal` for local debugging. Pins stay **3.11** / **2026-08-13** / desktop **3.16.17**.
- **Cursor CLI Aug 11 tip.** Platform support notes sticky skills and CLI installed-plugin hooks (debugging only).
- **Cursor currency (changelog through 2026-08-13 — Cloud Agent Builds).** `.cursor-version` keeps feature **3.11** / desktop CLI **3.16.17** and advances `changelog_date` to **2026-08-13**. Platform support + Quick Start document Cloud Agent Builds (warm install snapshots; enable on the environment Builds tab). Also covers Agent Plugins standard support, desktop `workspaceOpen` (`pluginPaths`), and Automations memory-file delete.

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
  **Update (dev#642):** `api.productionmaster.dev` now resolves and serves the
  BFF — the "inert until DNS lands" caveat above no longer holds. The Python
  SDK's `DEFAULT_SERVICE_URL` has been moved off the service's raw Vercel
  deployment origin onto this vanity host now that it is live. (Every IDE
  adapter and `pmctl` still carry no baked-in default at all — they require
  `PM_SERVICE_URL`/`--service` explicitly — so there is nothing to bring into
  alignment on that side.)

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
- **Claude Code target bumped to 2.1.233** (from 2.1.232) in `.claude-code-version`
  and `docs/user/platform-support.md`. One 2.1.233 fix reaches this repo's own
  files: every command in `commands/` interpolates `$ARGUMENTS` in both its
  prose and its Bash block, and before 2.1.233 an argument value shaped like a
  template marker could be re-expanded a second time instead of passed through
  literally — troubleshooting gains a **Command arguments (Claude Code)**
  section naming the affected commands and the fix version. Also noted:
  **`claude plugin validate` now checks a bare `.claude/skills` directory**
  and reports unparseable `SKILL.md` frontmatter — this repo's
  `run-production-master` skill already parses cleanly, so no change was
  needed, just a documentation mention. Reviewed and not applicable: GitLab
  merge-request URLs in `--worktree`/`claude agents`, the
  `forward_user_identity` apps-gateway setting, opt-in Bash memory-cgroup
  limits, the WebFetch cache-TTL env var, notification-hook/idle-CPU/Windows
  NT-path/self-hosted-runner fixes, the GitHub-app-setup-tip change for
  GitLab/Bitbucket origins, and todo/task-tracking tools being off by default
  on newer models (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1` restores them) — none of
  this client's commands or docs reference those tools or surfaces.
- **Claude Code target bumped to 2.1.232** (from 2.1.231) in `.claude-code-version`
  and `docs/user/platform-support.md`. The 2.1.232 delta needs no client change;
  two entries improve the install story and are now documented: **`/plugin install
plugin@marketplace` refreshes the marketplace first** — quick-start's reload note
  and troubleshooting's registration section carry the version-scoped behavior
  (refresh-first on 2.1.232+, refresh-and-retry on 2.1.221–2.1.231) — and the fix
  for a **startup race that could silently unregister a plugin marketplace**
  (concurrent `known_marketplaces.json` writes), which troubleshooting now names
  so a vanished marketplace reads as a host-version answer instead of a
  registration mistake. Platform-support also notes the managed-settings aliases
  (`allowedMarketplaces`/`additionalMarketplaces`) and GitLab-hosted marketplaces
  (bare `gitlab.com` repo URLs) for teams distributing this plugin. Reviewed and
  not applicable: the MCP protocol-version-probe hang fix concerns Claude Code's
  own MCP client — this client's Claude Code path registers via `/plugin
install`, not MCP, and the `.cursor/mcp.json`/`.codex/config.toml`/
  `opencode.json` registrations talk to those editors' hosts; GitLab token
  redaction, session `@`-mentions, subagent-forking defaults, Remote Control,
  gateway overlay validation, and sandbox `ripgrep` scoping are host-side and
  touch neither the adapter registration shapes nor the SSE streaming contract
  this client implements against the Production Master service.
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
- Initial repository scaffold (2026-07-13): README, documentation tree,
  contributing guide, and CI. Documented the thin-client-over-hosted-service
  architecture. Empty npm workspaces layout (`packages/*`) ready to be
  populated.

[Unreleased]: https://github.com/ProductionMasterAI/production-master/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ProductionMasterAI/production-master/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ProductionMasterAI/production-master/releases/tag/v0.1.0
