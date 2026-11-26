# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | 2.1.332 |
| Cursor | pending | 3.11 (+ changelog 2026-11-06) |
| Codex | pending | 0.169.1 |
| OpenCode | pending | pending |

All four adapter packages now ship a runnable `dist/cli.js`, so each client is
usable today. The Codex release this repo targets is **0.169.1** and the Cursor
release is **3.11** (changelog covered through 2026-11-06; desktop CLI observed at **3.31.15**): for each, the
compatibility delta was reviewed against the existing adapter and its registration
shape (`.codex/config.toml` for Codex, `.cursor/mcp.json` for Cursor), and nothing
in either requires a client change. That is a documentation review, not a host
test — `Validated against` stays `pending` for both, as it does for every platform,
because running the adapter end-to-end against a released host is a separate axis
that no target has cleared yet. 


**Voice Chat with Agents (2026-11-06).** Realtime two-way voice with agents (IDE / Agents Window / web / iOS); separate from dictation (Cmd+Shift+Space). Optional for operator steer of local adapter sessions — no MCP registration change ([changelog](https://cursor.com/changelog)).

**Build Live Apps (2026-11-05).** Cloud Agents can publish Cursor-hosted live apps. Orthogonal to this thin-client plugin; do not move product console hosting off the canonical Vercel projects ([changelog](https://cursor.com/changelog)).

**Desktop 3.31.15 (stable download API 2026-11-22).** Stable download line **3.27.22 → 3.31.15** while the public feature write-up remains **3.11** / **2026-11-06**. Official IDE + Agents Window release notes publish through **3.30** (no 3.31 section yet). **3.30** adds MCP tool-description search, skill-source chips, Mermaid copy/save as image, voice-chat settings/chimes, and Agents Window usage-panel / chat text-size / EOL-nag fixes.

**Agent SDK (2026-10-20).** Cursor's Agent SDK (`@grok/agent-sdk`) lets teams ship versioned PR-review / triage bots with evals ([docs](https://cursor.com/docs/agent-sdk), [changelog](https://cursor.com/changelog)). Optional and **orthogonal** to this thin-client plugin: bots may call the hosted public API / MCP only — never reimplement investigation pipeline logic here (public-repo IP boundary).

**Cloud Agent canvases + Environments API (2026-10-16).** Cloud agents can publish shareable interactive canvases; Environments API (beta) manages environments programmatically; environments support up to 300 repos and load ~5× faster ([changelog](https://cursor.com/changelog/cloud-agent-canvases-and-environments)). Optional for this thin-client plugin — no MCP registration change.

**Origin App Marketplace (2026-10-13).** Origin apps for deploy/CI/review/security ([changelog](https://cursor.com/changelog/origin-app-marketplace)). Distinct from this plugin's marketplace install path; GitHub stays install/CI source of truth.

**Remote Control (2026-10-06).** iOS can steer local Cursor agents on a paired computer ([changelog](https://cursor.com/changelog/remote-control-local-agents)). Optional operator convenience; Cloud Automations remain the unattended path.

**Security Review + Rollouts (2026-09-23).** Teams/Enterprise bots from [Automations](https://cursor.com/automations) ([docs](https://cursor.com/docs/security-agents)). Security Review comments exploitable bugs on ready PRs (drafts skipped; Bugbot keeps style/quality); use `/review-security` before push. Rollouts watches deploy health per environment — optional for this public thin-client (no product deploy surface here). [Changelog](https://cursor.com/changelog/rollouts-and-security-reviewer).

**Desktop 3.31.15 (see above).** Prior pin **3.27.22** superseded; feature write-up **3.11** / **2026-11-06**. IDE notes cover **3.26**–**3.30** (Resume-after-crash, sticky Always Run, `parent_agent_id`, Mermaid, Reduce Motion). **3.26:** resumable agents after extension-host crash; sticky Always Run when `~/.cursor/permissions.json` manages terminal allowlists. **3.27:** `parent_agent_id` on `subagentStart`/`subagentStop`; Mermaid expand/zoom/copy in markdown preview; Reduce Motion; faster first-window startup; non-UTF-8 agent I/O fixes. Retains 3.24–3.25 hook **`tool_use_id`** / **`transcript_path`** / auto-review / OOM / MCP OAuth hosted callback and 3.23 MCP allowlists / service tokens / Origin MCP. For this thin client: prefer Resume on crashed local adapter sessions; prefer service tokens over personal PATs for Cloud Agent CI triage; confirm org MCP allowlists still permit any Team MCP registration after upgrade.

**Cursor currency (desktop 3.31.15 / CLI 2026-11-17).** Feature write-up remains **3.11** (changelog through **2026-11-06** Voice Chat). The desktop download line is **3.31.15** (2026-11-22). CLI changelog through **2026-11-17** advances from **2026-08-26**: dashboard prompt hooks now run in the CLI, Linux sandbox `privateTmp`, `CURSOR_LOGIN_SHELL=0`, MCP tool-description search, and `--mint-scm-token` for self-hosted workers. Persistent sessions (`agent persist` / `/detach`) from 2026-08-26 remain useful for long local adapter smoke runs — optional; no MCP registration change. Hibernated self-hosted worker wake on follow-up is irrelevant to this thin-client plugin (constraint #4 / no self-hosted Cursor workers declared here).

The tracked pins live at the repo root:
[`.claude-code-version`](../../.claude-code-version),
[`.codex-version`](../../.codex-version), and
[`.cursor-version`](../../.cursor-version).

Codex 0.156.0 through 0.159.2 were reviewed cumulatively against this adapter. Native
worktree/task lifecycle, usage reporting, background-server recovery, stronger proxy and
network-policy enforcement, MCP OAuth/client-secret handling, opt-in instant interruption,
thread-history improvements, and GPT-6.1 Sol becoming the bundled default do not change this
repo's `.codex/config.toml` registration or thin-client command contract. The removals of
`tui.prompt_suggestions` and the bundled `plugin-creator` skill are also host-side for this
adapter. Prefer these native Codex capabilities over custom wrappers when future Codex-specific
orchestration needs them. The 0.159.2 Windows background-console fix is consumed upstream; no
repository-specific workaround is carried here.

Codex 0.160.0 through 0.164.0 were reviewed for compatibility and useful low-risk adoption. Native projectless sessions, managed worktrees, `/mcp login`, custom provider capability overrides, default instant steering and Code Mode cancellation, parallel read-only tools, `/config`, `/keymap`, `/daemon` restart, and restored thread/network permissions do not change this thin client's stdio MCP registration or command contract. Codex 0.163.0 removes the bundled patched `zsh` and retired shell flags; this repo uses `node` as its MCP command and does not set those flags. Stronger proxy checks, Windows remote MCP environment fixes and background-server recovery are consumed upstream. Prefer native Codex capabilities to custom wrappers; no speculative host configuration or MCP protocol claim is added. Direct host validation remains pending.

Codex 0.164.0 adds native `/presets`, inline `/model` and `/permissions` arguments, enterprise MCP account-grant/OAuth sign-in and credential masking for remote commands. It improves session compaction/recovery, Windows proxy authentication and macOS sandbox path protections. This adapter's local stdio MCP registration and device-code login do not require a migration; no new configuration or wrapper is introduced. Prefer native Codex authentication and session recovery if a future Codex-only integration needs them. This is a changelog review, not direct CLI validation.

Codex 0.167.0 (2026-11-06) adds `codex doctor --network-only` and `codex queue --resume`; the first is the preferred native network/WebSocket diagnostic and the second is a host-native unloaded-thread recovery path. Keyboard transcript selection, Markdown in async questions, Terra catalog expansion and safer follow-up prompts are host-only. Approval/permission persistence across resume/fork, app-server lifecycle, reasoning-token accounting and reconnection fixes require no change to this adapter's local stdio MCP registration. No new config keys, SDK/protocol claims or cross-platform changes were introduced. Direct validation remains pending.

**Codex 0.168.0–0.169.0 (2026-11-13).** Native provider discovery/configuration and custom gateway onboarding now cover more terminal and app-server workflows. Codex 0.168.0 warns about legacy `features.multi_agent` configuration and points to `agents.enabled` to disable subagents; this thin MCP client does not configure either. Codex 0.169.0 keeps project configuration and MCP servers disabled in untrusted directories even under `codex exec --sandbox workspace-write`; use explicit `--trust` only for repositories that are actually trusted. The local stdio MCP registration and Node CLI contract remain unchanged. Native provider selection and gateway authentication should be preferred over custom wrappers. No direct Codex 0.169.0 host test has been run.

Codex 0.165.0 (2026-10-27) adds built-in Google Cloud Vertex AI provider support, GPT-6.1 Terra catalog entries, session repository filtering and agent directory grouping, in-conversation reasoning-effort changes, and memory v2 defaults for new profiles. Experimental app-server attached thread forks are not used by this thin client. Dropped remote MCP requests now cancel, queued agent messages no longer restart work after interruption or Plan-mode switching, provider model-not-found errors stop retrying, default approval-reviewer behavior is corrected, and marketplace URL validation is tightened. These changes are host-side: this adapter's existing local stdio MCP registration, Node CLI command and device-code login remain unchanged. Prefer native provider/session/MCP handling instead of custom wrappers. No speculative config or protocol migration is needed; direct Codex CLI validation is still pending.

Codex 0.150.0 adds native task references, improved task naming/copy ergonomics, and an
`Interrupt` hook that can invoke commands or MCP handlers when a top-level turn is
interrupted. Codex 0.150.1 is a remote-compaction budgeting fix. Codex 0.151.0 adds a
configurable discovery grace for optional MCP servers, lets extensions inspect or replace
MCP tool results before they reach the model, improves per-repository plugin catalog
configuration and invalid-marketplace isolation, and further hardens restored permission
profiles and remote sandbox path semantics. None changes this adapter's `.codex/config.toml`
registration or MCP tool contract, so no compatibility migration is required here; the host
reliability fixes apply automatically.

Codex 0.152.0 allows package-style MCP server names containing `:`, `@`, `/`, and `.`, adds
per-tool `output_token_limit`, and lets app-server clients configure long
`thread/shellCommand` timeouts. It also makes the planning tool opt-in via
`tools.update_plan.enabled = true`. This adapter does not depend on `update_plan` and its
current MCP server names/tool outputs require no new limits, so no migration is required;
prefer these native controls over custom name-normalizing or output-truncation wrappers if a
future Codex-specific integration needs them. Codex 0.152.1 is a Guardian policy-correctness
fix with no client-side change.

Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol. Production Master's current
stdio server intentionally continues to advertise its older supported MCP
protocol; changing only the protocol string would be unsafe. A future SDK-backed
upgrade should adopt the newer protocol when paginated discovery, multi-round
requests, and non-blocking startup can be implemented and tested together.

**Claude Code notes (2.1.327 → 2.1.332).** `.claude-code-version` advances to
**2.1.332**, covering 2.1.328 through 2.1.332. Registration, sandboxing
configuration shape, and command-argument handling are unchanged.

- **Adopted: documented the one-sided MCP background-task fix for servers
  that set headers (2.1.330).** 2.1.330 lets a backgrounded session keep
  following a running MCP task after you move it behind — "but not if its
  server uses stdio or sets headers." This plugin's one `mcpServers` entry
  is `type: "http"` with a templated `headers.Authorization`, so it does
  not get the improved tracking: an investigation started with
  `/production-master:investigate` and then backgrounded can still show as
  stopped even though it is still running on the hosted service. Documented
  as a known limitation in
  [`docs/user/troubleshooting.md`](../../docs/user/troubleshooting.md)
  under "Claude Code: the plugin's access token," where users already look
  for this server's connection behavior. No manifest change fixes this —
  the `Authorization` header is required by the hosted service, not
  optional.
- **Adopted: documented the new `/mcp` "Server message" row for remote HTTP
  MCP servers (2.1.329).** `/mcp` now shows a "Server message" row with the
  JSON-RPC error text a remote HTTP MCP server sends back when it refuses
  the connection. For this plugin's `production-master` server, that
  surfaces the hosted service's own wording for an expired or revoked
  token directly in `/mcp`, instead of only Claude Code's generic
  "unauthorized." Added a pointer to this in
  [`docs/user/troubleshooting.md`](../../docs/user/troubleshooting.md)'s
  auth-error entry.
- **Reviewed, flag for future action: managed `extraKnownMarketplaces`
  auto-update defaulting to on, effective on or after November 30, 2026
  (2.1.331).** This repo is its own marketplace
  ([`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json));
  an organization that adds it via managed settings'
  `extraKnownMarketplaces` will start auto-updating by default once that
  change ships, unless the admin sets `"autoUpdate": false` on the entry.
  This is an admin-side managed-settings choice, not something this repo's
  manifest controls — no action here, but worth surfacing if a team that
  pins this marketplace by commit for review purposes is ever identified.
- **Version-check note:** this run's installed `claude` CLI reports `claude
  --version` → `2.1.332 (Claude Code)`, matching the newest entry published
  on the official changelog.
- **Reviewed, not applicable: `optionalDependencies` for plugin manifests
  (2.1.331).**
  [`plugin/.claude-plugin/plugin.json`](../../plugin/.claude-plugin/plugin.json)
  declares no `dependencies` of any kind for Claude Code to mark optional —
  this plugin's one MCP server is declared inline, not installed as a
  dependency.
- **Reviewed, not applicable: skills from MCP servers shown as
  `server:skill` in the `/` menu, and a new `PreSkillShellCommand` hook
  event (2.1.332).** This plugin defines no skills of its own and no hooks
  — [constraint #4](../../.claude/rules/constraints.md) and the
  `LOCAL_CODE_HOOK` guard in
  [`check-plugin-folder.mjs`](../../scripts/check-plugin-folder.mjs). Its
  one MCP server is a remote `http` endpoint, not a source Claude Code
  would list skills from here. Confirmed against `claude plugin validate
  plugin/.claude-plugin/plugin.json`'s own "Provides" listing, which shows
  only the one `mcpServers` entry and four prompt-only commands.
- **Reviewed, not applicable: fixes scoped to local, stdio, WebSocket, or
  SSE MCP servers (2.1.328–2.1.332), and to Claude Code's own `claude mcp
  login`/OAuth device-code MCP sign-in (2.1.329–2.1.330).** This plugin's
  one server is a remote `http` endpoint authenticated with a static
  bearer token templated from `userConfig.api_token`, not Claude Code's own
  OAuth MCP login flow, and it is registered inline in `plugin.json`, not
  run as a local or stdio process.
- **Reviewed, not applicable: self-hosted-runner-specific fixes and
  additions across 2.1.328–2.1.330.** [Constraint
  #5](../../.claude/rules/constraints.md) keeps this repo on GitHub-hosted
  `ubuntu-latest` runners only; none of this plugin's own CI or docs
  reference the self-hosted runner.
- **Reviewed, benefits automatically / no action: HTTP MCP servers
  reconnecting by themselves after a slow or stalled reconnect (2.1.329);
  Claude being told when a connected server's tools fail to load instead
  of assuming it has none (2.1.329); the "JSON schema is invalid" failure
  fixed for sessions with many MCP tools (2.1.330); `/mcp` now listing
  plugin-registered servers under "Plugin MCPs" rather than alongside
  built-ins (2.1.330); a server's `/mcp` page staying open with the
  failure cause in view on Reconnect (2.1.330); and freezes/runaway memory
  fixed for long permission-rule and hook-output checks (2.1.331).** All
  six describe the client-side MCP connection and permission-rule
  machinery this plugin relies on (one `http` server, a sizeable
  [`.claude/settings.json`](../../.claude/settings.json) allow/deny list)
  without needing any manifest, settings, or docs change beyond the two
  items adopted above — upgrading Claude Code is the only action.
- This repo's own `claude plugin validate .` and `claude plugin validate
  plugin/.claude-plugin/plugin.json` were re-run on the installed 2.1.332
  CLI: both still pass with no findings. `npm run check:plugin` stays
  clean (8 files, no directory findings). `npm run build`, `npm test` (460
  passed, 1 pre-existing skip), and `npm run lint` all ran clean on this
  pass.

**Claude Code notes (2.1.322 → 2.1.327).** `.claude-code-version` advances to
**2.1.327**, covering 2.1.323, 2.1.325, 2.1.326, and 2.1.327 (2.1.324 was
never published as a separate entry). Registration, sandboxing
configuration shape, and command-argument handling are unchanged.

- **Adopted: `engines["claude-code"]` in `plugin.json` (added 2.1.323).**
  Claude Code now refuses to install, update, or load a plugin outside the
  Claude Code version range its manifest states, and picks the newest
  version that fits on install/update. This plugin had declared no floor at
  all, so [`plugin/.claude-plugin/plugin.json`](../../plugin/.claude-plugin/plugin.json)
  now sets `"engines": {"claude-code": ">=2.1.83"}`. That floor is not
  arbitrary: this plugin's manifest depends on `userConfig` with external,
  keychain-backed `sensitive: true` storage (`api_token`) and on an `http`
  MCP server entry whose `headers.Authorization` is templated from
  `${user_config.api_token}` — both of which this repo's own
  [`check-plugin-folder.mjs`](../../scripts/check-plugin-folder.mjs) guard
  (`USER_CONFIG`, `LOCAL_CODE_MCP`) requires. `userConfig` with external
  prompting and keychain/credential-file storage for `sensitive: true`
  values shipped in 2.1.83 (confirmed against the official
  `anthropics/claude-code` `CHANGELOG.md`, not guessed); the `http` MCP
  transport this plugin's one server uses has been supported since 1.0.27
  and is not the binding constraint. `plugin.json` version bumps to
  **0.2.1** for this manifest change. `claude plugin validate .` and `claude
  plugin validate plugin/.claude-plugin/plugin.json` both still pass with
  the new field present, and `npm run check:plugin` is unaffected (it does
  not inspect `engines`).
- **Version-check note:** this run's installed `claude` CLI reports `claude
  --version` → `2.1.327 (Claude Code)`, matching the newest entry published
  on the official changelog.
- **Reviewed, not applicable: Code Mode, an experimental opt-in where
  Claude writes JavaScript to call its tools (2.1.323).** Code Mode is a
  session/host opt-in, not something a plugin manifest declares or needs to
  support; this repo's plugin remains a manifest, prompt-only commands, and
  one remote MCP server (constraint #4 — no pipeline/agent logic of this
  repo's own either way).
- **Reviewed, not applicable: type checking of a plugin's TypeScript hooks
  module in `claude plugin validate`, and the `$` nouns a mod's
  `engine.create` hook adds, shown in `claude plugin validate` (2.1.323).**
  This plugin declares no hooks and is not a mod — [constraint
  #4](../../.claude/rules/constraints.md) (no hooks of this repo's own) and
  the directory's own `LOCAL_CODE_HOOK` guard in
  [`check-plugin-folder.mjs`](../../scripts/check-plugin-folder.mjs).
- **Reviewed, not applicable: a startup warning when a plugin's language
  server can't start (2.1.323), and plugin MCP bundles (`.mcpb`, `.dxt`)
  unpacking under the plugins directory instead of `.mcpb-cache` (2.1.325).**
  This plugin declares no `lspServers` and ships no MCP bundle — its one
  server is a remote `http` endpoint declared inline in `plugin.json`
  (`LOCAL_CODE_LSP` / `LOCAL_CODE_MCP` guards, same constraint).
- **Reviewed, not applicable: `claude plugin install` and `/plugin` warning
  instead of reporting success when a plugin's install command writes to
  stderr (2.1.323).** This plugin has no install command — it is a remote
  MCP registration plus prompt-only commands; Claude Code needs no Node.js
  to use it (see the Quick Start section of the [README](../../README.md)).
- **Reviewed, not applicable: `CLAUDE_CODE_AUTO_MODE_MODEL` support for
  Claude Desktop sessions on third-party providers (2.1.323); a managed
  `strictPluginOnlyCustomization` lock on agents and skills taking effect in
  already-running sessions (2.1.325); and marketplace `ref` accepting the
  full commit ID of any branch or tag commit (2.1.325).** The first two are
  session/organization settings this repo's own `.claude/settings.json` and
  manifests declare no opinion on; the third is a marketplace-pinning
  feature this repo's
  [`marketplace.json`](../../.claude-plugin/marketplace.json) does not use
  (its one entry pins no `ref` at all).
- **Reviewed, benefits automatically / no action: plugins with a malformed
  `plugin.json` display field (such as `author` or `homepage`) now load,
  with their hooks and MCP servers, instead of being refused (2.1.325); a
  note in `/plugin` and `claude plugin list` when such a field is ignored
  (2.1.326); and a sandboxed `git checkout`/`stash`/autostash pull now
  warning Claude when it cannot update protected files such as those in
  `.claude` (2.1.325).** Checked this plugin's `author` and `homepage`
  fields against the schema — both are well-formed, so the first two are
  defensive fixes for a case this repo doesn't hit. The sandbox note
  benefits any contributor session running a sandboxed git pull/checkout
  against this repo's own `.claude/` with no config change needed here.
- This repo's own `claude plugin validate .` and `claude plugin validate
  plugin/.claude-plugin/plugin.json` were re-run on the installed 2.1.327
  CLI after adding `engines`: both still pass with no findings.
  `npm run check:plugin` stays clean (8 files, no directory findings).
  `npm run build`, `npm test` (440 passed, 1 pre-existing skip), and `npm
  run lint` all ran clean on this pass.

**Claude Code notes (2.1.318 → 2.1.322).** `.claude-code-version` advances to
**2.1.322**, covering 2.1.319, 2.1.321, and 2.1.322 (2.1.320 was never
published as a separate entry). Registration, sandboxing configuration
shape, and command-argument handling are unchanged. Nothing in this delta is
adopted or closes a real gap in this repo's own rules; every item is
reviewed line by line and ruled not applicable by [constraint
#4](../../.claude/rules/constraints.md) (no pipeline/agent logic, no hooks,
mods, subagents, or MCP server of this repo's own for Claude Code) or
[constraint #5](../../.claude/rules/constraints.md) (no self-hosted
runner):

- **Version-check note:** this run's installed `claude` CLI reports `claude
  --version` → `2.1.322 (Claude Code)`, matching the newest entry published
  on the official changelog.
- **Reviewed, not applicable: the MCP OAuth redirect secret-leak fix and
  the Bash sandbox-escape-on-worktree-create fix (2.1.321).** This repo's
  `production-master` MCP server authenticates with a plain `Authorization:
  Bearer ${user_config.api_token}` header declared in
  [`plugin/.claude-plugin/plugin.json`](../../plugin/.claude-plugin/plugin.json)
  — never Claude Code's own `claude mcp login` OAuth flow — so there is no
  OAuth redirect of this repo's own for the fix to touch; and this repo's
  contributor workflow is fork-and-branch per
  [CONTRIBUTING.md](../CONTRIBUTING.md), never `claude agents`
  teleport/worktrees (same reasoning as the 2.1.309 worktree note above).
- **Reviewed, not applicable: Claude Fable 5.2 becoming the default Fable
  model, and fast mode on Vertex (2.1.321, 2.1.322).** Both are model-call
  surface this repo defines none of — constraint #4, no LLM/model-provider
  SDK import of any kind.
- **Reviewed, not applicable: MCP tasks in the terminal,
  `permissions.denyInsteadOfPrompting`, and `--settings <file>` for `claude
  remote-control` (2.1.319, 2.1.321).** MCP task backgrounding is something
  an MCP *server* opts into; the hosted Production Master service owns that
  surface, not this thin client (constraint #4). The other two are
  session/host settings this repo declares no opinion on in
  [`.claude/settings.json`](../../.claude/settings.json).
- **Reviewed, benefits automatically / no action: slash commands typed
  after a leading space, tab, or newline now run instead of being sent as
  text, and `/context`'s token-usage estimate no longer overcounts tool
  definitions (2.1.319, 2.1.322).** General CLI correctness fixes; this
  repo's four commands and one MCP server benefit with no config change.
- **Reviewed, not applicable: plugin dependency installs on `claude plugin
  update`/"Update now", and `${CLAUDE_PLUGIN_ROOT}` substitution in a
  plugin's `subagentStatusLine` (2.1.319).** This repo's
  [`marketplace.json`](../../.claude-plugin/marketplace.json) ships exactly
  one plugin with no declared dependencies, and defines no
  `subagentStatusLine` (constraint #4, no subagents).
- This repo's own `claude plugin validate .` and `claude plugin validate
  plugin/.claude-plugin/plugin.json` were re-run on the installed 2.1.322
  CLI: both still pass (the one pre-existing, unrelated `ICON_MISSING`
  directory warning is unchanged from prior passes). `npm run build`,
  `npm test`, and `npm run lint` all ran clean on this pass.

**Claude Code notes (2.1.312 → 2.1.318).** `.claude-code-version` advances to
**2.1.318**, covering 2.1.314, 2.1.316, 2.1.317, and 2.1.318 (2.1.313 and
2.1.315 were never published as separate entries). Registration, sandboxing
configuration shape, and command-argument handling are unchanged. Nothing in
this delta is adopted or closes a real gap in this repo's own rules; every
item is reviewed line by line and ruled not applicable by [constraint
#4](../../.claude/rules/constraints.md) (no pipeline/agent logic, no hooks,
mods, subagents, or MCP server of this repo's own for Claude Code) or
[constraint #5](../../.claude/rules/constraints.md) (no self-hosted runner):

- **Version-check note:** this run's installed `claude` CLI reports `claude
  --version` → `2.1.318 (Claude Code)`, matching the newest entry published
  on the official changelog — the first pass in a while where the local
  binary and the changelog's newest published entry agree exactly.
- **Reviewed, not applicable: `permissions.blockWritesOutsideWorkingDirectories`
  and the Agent SDK `onFailure: "block"` hook option (2.1.314, 2.1.317).**
  Both are host-side settings/mod surfaces for sessions and hooks this repo
  defines none of — it registers for Claude Code as four plain
  prompt-only slash commands plus a remote MCP server, nothing deeper.
- **Reviewed, not applicable: the `claude plugin validate` custom-named
  marketplace file fix (2.1.318).** This repo's marketplace manifest is
  already named `marketplace.json` — the standard name the fix was about
  accepting as a *non-standard* name — so there is nothing to change.
  `claude plugin validate .claude-plugin/marketplace.json` and `claude
  plugin validate plugin/.claude-plugin/plugin.json` were re-run on the live
  2.1.318 CLI: both still pass.
- **Reviewed, not applicable: pooled group budgets, `CLAUDE_CODE_SUBAGENT_EFFORT`,
  fast-mode deprecation for Opus 4.8, idle compaction, and the email-address
  network-send check (2.1.314, 2.1.316, 2.1.317).** All are
  organization/gateway admin, subagent, or model-call surface this repo
  defines none of (constraint #4). Everything else across 2.1.314–2.1.318 —
  VS Code, Remote Control, Cloud sessions, Claude Tag, and Code Review
  product changes, plus host-side CLI reliability fixes — applies
  automatically with no config change.

**Claude Code notes (2.1.306 → 2.1.312).** `.claude-code-version` advances to
**2.1.312**, covering 2.1.307 through 2.1.312 (six releases, the first time
this repo's pin has advanced since the prior pass). Registration, sandboxing
configuration shape, and command-argument handling are unchanged. Nothing in
this delta is adopted or closes a real gap in this repo's own rules; one
item is flagged as relevant to a sibling repo rather than this one, and
everything else is reviewed line by line and ruled not applicable by
[constraint #4](../../.claude/rules/constraints.md) (no pipeline/agent
logic, no hooks, mods, subagents, or MCP server of this repo's own for
Claude Code) or [constraint #5](../../.claude/rules/constraints.md) (no
self-hosted runner):

- **Version-check note:** this run's installed `claude` CLI reports `claude
  --version` → `2.1.316 (Claude Code)`, newer than the newest entry actually
  published on the official changelog (2.1.312, dated 2026-10-27). The pin
  advances to 2.1.312 — the changelog's newest published entry, and this
  task's defined compatibility target — rather than to the ahead-of-changelog
  local binary version, so a future pass should re-review 2.1.313–2.1.316 once
  those are documented on the changelog.
- **Reviewed, flagged for a sibling repo, not applicable here: the HTTP-MCP
  double-dispatch fix (tool calls sent twice when the connection closed
  mid-call, 2.1.307).** As the 2.1.268 MCP-secret-masking note and the
  2.1.274 MCP-client-v2 note above already established, this repo's Claude
  Code path registers via `/plugin install` and execs a binary from
  [`commands/`](../../commands), never an `.mcp.json` server — so there is
  no registered Claude Code MCP connection of this repo's own for the fix to
  touch. `production-master-mcp` runs an HTTP MCP transport and is the repo
  this fix actually matters for.
- **Reviewed, not applicable: `/claude-api api-version`, the
  `claude_code.safety_event` OpenTelemetry event, and `@claude review
  stop`/`off`/`pause` for Code Review subscriptions (2.1.307).** As the
  2.1.278 note below already established, this repo is used from a terminal
  or from [`claude.yml`](../../.github/workflows/claude.yml)'s
  comment-triggered `anthropics/claude-code-action@v1` job, never the
  separate auto-PR "Code Review" product those controls govern; this repo
  configures no OpenTelemetry exporter or Claude-apps-gateway of its own
  (constraint #4).
- **Reviewed, not applicable: VSCode-extension TLS/certificate handling, a
  WebSearch-budget notice wording tweak, an `axScreenReader` settings-tier
  restriction, and self-hosted-runner changes (2.1.307).** This repo is
  never used from the VS Code extension (same reasoning as the 2.1.278
  note), makes no model calls of its own, and runs CI on GitHub-hosted
  `ubuntu-latest` runners only — constraint #4 and constraint #5.
- **Reviewed, not applicable: fork subagents launched together now each
  know which launch is their own (2.1.307).** This repo's five commands
  spawn no subagents of their own (constraint #4) — there is no "launched
  together" case here.
- **Reviewed, not applicable: a worktree-create change that no longer
  fetches on demand (2.1.309).** This repo's contributor workflow is
  fork-and-branch, per [CONTRIBUTING.md](../CONTRIBUTING.md), never `claude
  agents` teleport/worktrees (same reasoning as the 2.1.274 note below).
- **Reviewed, not applicable: `Monitor` tool provider expansion (2.1.310).**
  This repo uses no `Monitor` watch or `Workflow` tool script of its own
  (constraint #4), the same reasoning as the 2.1.269
  `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` note below.
- **Reviewed, benefits automatically / no action: a one-way `/compact`-disable
  setting (2.1.311).** Session-level behavior with no
  [`.claude/settings.json`](../../.claude/settings.json) field for this repo
  to set.
- **Reviewed, not applicable: dropping the `-1m` model-name-suffix
  convention (2.1.311).** This repo makes no model calls of its own
  (constraint #4) — no model name of this repo's own to rename.
- **Reviewed, benefits automatically / no action: output-format
  control-character escaping (2.1.311).** General correctness fix to
  `--output-format json`/`stream-json`; this repo scripts no parsing of the
  `claude` CLI's own output (its five commands exec the thin-client binary
  over `Bash`, and [`claude.yml`](../../.github/workflows/claude.yml) runs
  `anthropics/claude-code-action@v1` interactively, not via scripted output
  parsing) — nothing here to break or to fix.
- **Reviewed, not applicable: a lower-bound fix to subagent
  `autoCompactWindow` (2.1.312).** This repo defines no subagents of its own
  (constraint #4).
- **Reviewed, not applicable: the per-event hook-concurrency cap raised from
  12 to 24 (2.1.312).** This repo defines no hooks under `.claude/`
  (constraint #4) — same reasoning as the 2.1.301–2.1.306 12-concurrent-hook
  note below, just a higher number to not apply to.
- This repo's own `claude plugin validate .` and `claude plugin validate
  .claude-plugin/plugin.json` were re-run on the installed 2.1.316 CLI: both
  still pass (one pre-existing, unrelated `ICON_MISSING` directory warning,
  unchanged from prior passes and out of scope for a Claude-Code-version
  review). `npm run build`, `npm test` (292/292 passing), and `npm run lint`
  all ran clean on this pass.

**Claude Code notes (2.1.300 → 2.1.306).** `.claude-code-version` advances to
**2.1.306**, covering 2.1.301 through 2.1.306 (2.1.301 and 2.1.302 shipped
together; 2.1.303 published no itemized entries beyond bug fixes and
reliability improvements). Registration, sandboxing configuration shape, and
command-argument handling are unchanged. Nothing here is adoptable as a
one-line config change, and — unlike the 2.1.296/2.1.299 round above — nothing
closes a real gap in this repo's own rules; reviewed line by line regardless:

- **Reviewed, not applicable: everything mod-, hook-, MCP-server-, gateway-,
  and managed-settings-shaped across 2.1.301–2.1.306** — `.catch` on a mod
  hook now running only on throw or timeout, `$.env.set` resolving `{}`/
  `{ deny }`, the 12-concurrent-hook-per-event cap, fork subagents defaulting
  on and subagents always backgrounding in Desktop/VS Code, `-p`/SDK sessions
  starting in `default` permission mode on third-party integrations or with
  telemetry off, a mod's `tool.check` event gaining `decider: "person"`/
  `e.isReadOnly`, the 1,024-hooks/16,384-character skill-source cap,
  `sandbox.allowNestedUserNamespaces`, and the narrower `allowedMcpServers`
  filter for a `managed-mcp.json` stdio server — this repo defines no hooks,
  mods, subagents, or managed settings of its own
  [constraint #4](../../.claude/rules/constraints.md); for Claude Code it
  registers only as four plain prompt-only slash commands under
  [`commands/`](../../commands), nothing deeper.
- **Reviewed, not applicable: the stdio MCP protocol-2026-07-28 "no tools"
  display fix (2.1.301/2.1.302).** Same reasoning — this plugin defines no
  `.mcp.json` server for Claude Code at all, unlike the Cursor/Codex adapters'
  own MCP registrations reviewed separately above.
- **Adopted as documentation: the 2.1.302 plugin install and config-write
  fixes.** Before 2.1.302, `claude plugin install` (and other `claude plugin`
  subcommands) could exit before a queued settings or config write finished,
  so an install could look successful while the registration was lost or a
  `.tmp` file was left behind. 2.1.302 also fixes git-sourced plugins showing
  version "unknown" and marketplaces re-cloning on every refresh when git
  defaults to the reftable ref format, which affects this repo's own
  `owner/repo` marketplace source. Neither needs a config change here, but
  both change what a user on an older CLI sees after the install path in the
  [quick start](quick-start.md), so that page now says so and the
  [troubleshooting](troubleshooting.md) registration notes point at the
  2.1.302 floor.
- **Reviewed, benefits automatically / no action: the rest of 2.1.301–
  2.1.306.** The `claude -p` cloud-session "Not logged in" false-error fix and
  the MCP-tools-heavy "prompt is too long" false-error fix (2.1.306), `Input`'s
  new `rows` option and hook `ask` prompts now naming the plugin that raised
  them (2.1.301/2.1.302), `/auto-mode-setup` and `/claude-api
  managed-agents-secure` (2.1.304), tool search on by default behind a custom
  `ANTHROPIC_BASE_URL` (2.1.304), `CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS`
  (2.1.305), and the `/artifacts` delete-confirmation keybinding change
  (2.1.305) apply to any session on this repo the next time it pulls a newer
  Claude Code, with no config change needed. 2.1.303 shipped bug fixes and
  reliability improvements only, with no itemized entries.

This repo's own `claude plugin validate .` and `claude plugin validate
.claude-plugin/plugin.json` were re-run on the live 2.1.306 CLI: both still
pass, with nothing new for either manifest check to flag.

**Claude Code notes (2.1.293 → 2.1.300).** `.claude-code-version` advances to
**2.1.300**, covering 2.1.294, 2.1.295, 2.1.296, 2.1.299, and 2.1.300 (2.1.297
and 2.1.298 were never published as separate changelog entries). Registration,
sandboxing configuration shape, and command-argument handling are unchanged.
Nothing here is adoptable as a one-line config change; two items close real
gaps in protections this repo already relies on, one closes a display/
spoofing gap relevant to a public fork-PR-driven repo, one is a reliability
fix directly relevant to how this plugin is installed, one is a required
`claude plugin validate`/README re-check, and everything else is either a
managed-org/gateway/model/mods/hooks/OTel/Workflow/self-hosted-runner/Cowork/
Artifact/Claude-Tag surface [constraint #4](../../.claude/rules/constraints.md)
(or [constraint #5](../../.claude/rules/constraints.md)) rules out, or
host-side UI/reliability work with no hook into this repo's four prompt-only
commands:

- **Documented: Bash permission checks could auto-approve a command prefixed
  with a `BASH_ARGV0=...` shell-variable assignment that then used that
  variable, bypassing a deny rule written for the plain command (2.1.296).**
  This is the same class of gap the 2.1.289 `FOO=bar git push --force origin
  main` fix closed for this repo's two
  [`.claude/settings.json`](../../.claude/settings.json) deny entries
  (`Bash(git push --force *)`, `Bash(git push -f *)`), there specifically so
  an auto-mode session can never force-push to `main`
  ([constraint #2](../../.claude/rules/constraints.md)) — this time via
  `BASH_ARGV0` rather than a plain prefix assignment. Update Claude Code; the
  deny entries themselves need no change.
- **Documented: a sandboxed command on macOS could read or write a denied
  path by its real location when the denied path passes through a symlink
  (2.1.299).** Closes a further gap in the same credentials-file-symlink
  protection story as the 2.1.236 wildcard-`denyRead`-hardening and 2.1.247
  symlink-deletion fixes above, and the 2.1.287 symlink-write-now-prompts fix
  below — relevant to anyone protecting a `PM_ACCESS_TOKEN` credentials file
  living outside the checkout with a sandbox `denyRead`/`denyWrite` entry on
  macOS. Update Claude Code; no change to the credentials file's location or
  any existing deny entry is needed.
- **Documented: a skill or command whose file/folder name contains hidden,
  direction-changing, or blank-like characters, or `<`/`>`, is no longer
  offered until renamed — such a `name:` is now ignored (2.1.299).** On this
  public, fork-PR-driven repo, a malicious contribution could previously add
  a file under [`commands/`](../../commands) or
  [`.claude/skills/`](../../.claude/skills) whose display name used one of
  these characters to visually spoof one of this plugin's four genuine slash
  commands (`/investigate`, `/connect`, `/update`, `/setup`) or
  its two skills. Update Claude Code; none of this repo's own file or folder
  names use any of the now-rejected characters, so nothing here needs
  renaming — the fix only closes the door on a future malicious addition.
- **Documented: `claude plugin install`/`enable`/`disable`/`marketplace add`
  retries a GitHub `owner/repo` plugin source's clone over HTTPS when no
  GitHub SSH key is configured, on Windows (2.1.296).** This is exactly how
  this plugin is installed —
  [Quick Start](quick-start.md#1-install-the-client-in-your-editor)'s
  `claude plugin install production-master --marketplace
  ProductionMasterAI/production-master` (or the two-step
  `/plugin marketplace add`/`/plugin install` form) names a bare
  `ProductionMasterAI/production-master` GitHub source — so a Windows
  contributor with no SSH key configured for GitHub previously saw the
  install fail outright instead of falling back to HTTPS. Update Claude
  Code; no change to the install instructions themselves is needed. Noted in
  [Quick Start](quick-start.md#1-install-the-client-in-your-editor) as a
  Windows-specific reliability note.
- **Reviewed, no change needed: `claude plugin validate`'s new advice when a
  plugin's README has no install line (2.1.295).** It only ever prints the
  line to paste and never changes the exit code, even with `--strict`.
  [README.md](../../README.md) already has one (the `/plugin marketplace
  add`/`/plugin install` block quick-start also shows), so there is nothing
  for the advisory to flag.
- **Reviewed, a refinement to an already-tracked, not-yet-adopted option:
  `claude plugin eval`'s new `--disallow-tools`/`disallowed_tools` case field
  (2.1.299).** Lets an eval case keep specific built-in tools (such as
  `Agent`) out of a run. This narrows, but does not resolve, the open
  question already tracked for this repo's single plugin having no automated
  eval/smoke-test suite — see Future opportunities in the tracking PR.
- **Reviewed, not applicable: everything hook-, mod-, MCP-server-, gateway-,
  OTel-, Workflow-, Cowork-, Artifact-, and self-hosted-runner-shaped across
  2.1.294–2.1.300** — `onFailure: "block"` for command/HTTP hooks and the
  change making a blocked action refuse rather than let through on hook
  failure (2.1.295/2.1.299), `UserPromptSubmit` running before skill/command
  expansion and the skill-frontmatter-hook ordering change (2.1.299), the
  `agent.spawn`/`turn.start`/`prompt.change`/`prompt.submit`-adjacent mod
  hooks and every `$.ui.*`/`$.session.*`/`$.prompt.*` mod API addition
  (2.1.295–2.1.300), the MCP allow-rule exact-server-name-match change and
  the MCP-tool-description/instruction length changes (2.1.295/2.1.296/
  2.1.299), Claude Haiku 5.5/Sonnet-cache-price/model-availability items, the
  Claude apps gateway additions (the `code` managed-policy key, `desktop`
  policy handling, `forceLoginMethod: "gateway"`, `CLAUDE_CODE_ATTRIBUTION_
  HEADER`, `timeouts.upstream_ttfb_ms`, per-upstream `models` lists), the
  OpenTelemetry GenAI semantic-convention attributes and new `api_request`
  cache-token fields, `/advisor` on AWS, the `Workflow`-tool and subagent
  additions (`autoCompactWindow`, `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`,
  32-skill subagent preload cap), Cowork cloud-session and self-hosted-runner
  orchestrator changes (`--shutdown-drain-sec` and the rest), and the
  Artifact-tool publish/watch-limit changes — is either a managed-org/
  gateway/model/mods/hooks/OTel/Workflow/Cowork/Artifact surface
  [constraint #4](../../.claude/rules/constraints.md) rules out, a
  self-hosted-runner surface [constraint #5](../../.claude/rules/constraints.md)
  rules out, or this repo defines/runs none of (no hooks, no mods, no
  `.mcp.json` server, no subagents, no `Workflow` tool script). This repo
  makes no model calls of its own either way.
- **Reviewed, benefits automatically / no action: the rest of
  2.1.294–2.1.300.** General session reliability and correctness fixes
  (idle terminal compaction, the exit-force-kills-background-commands
  change, the WSL2 `bwrap` sandboxed-command-startup fix, Bash permission
  check accuracy for for-loops over glob patterns, the Grep `-l`/`-c`/`-r`
  flag-handling fix, the HTTP MCP connection memory leak noted in the
  2.1.293 entry below, and the large volume of terminal/VSCode/Claude-Tag/
  Code-Review/Remote-Control UI and Windows-specific fixes) apply to any
  session on this repo the next time it pulls a newer Claude Code, with no
  config change needed. Nothing here changes registration, sandboxing
  shape, or command-argument handling beyond the items documented above.

**Claude Code notes (2.1.286 → 2.1.293).** `.claude-code-version` advances to
**2.1.293**, covering 2.1.287 through 2.1.293 — all seven published as their
own entries, no gap. Registration, sandboxing configuration shape, and
command-argument handling are unchanged. One item is adopted, two are
documented because they close real gaps in protections this repo already
relies on, one is a required `claude plugin validate` re-check, one is a
genuinely new surface not yet adoptable, and everything else is either a
managed-org/gateway/model/mods/self-hosted-runner surface
[constraint #4](../../.claude/rules/constraints.md) rules out or host-side
UI/reliability work with no hook into this repo's four prompt-only commands:

- **Adopted: the `claude plugin install <plugin> --marketplace <source>`
  CLI flag, now shown in [Quick Start](quick-start.md) (2.1.292).** This is a
  new flag on the `claude` binary itself, distinct from the already-adopted
  2.1.275 `/plugin install <plugin> --marketplace <source>` *slash command*
  run inside a session. `claude plugin install production-master
  --marketplace ProductionMasterAI/production-master` adds the marketplace
  and installs the plugin from a plain shell before a Claude Code session
  even starts — useful for scripting a contributor's environment setup.
  [Quick Start](quick-start.md#1-install-the-client-in-your-editor) now shows
  it as a terminal alternative alongside the existing in-session one-liner
  and the archive-source note.
- **Documented: a shell write through a repo-committed symlink onto a
  sensitive file now prompts instead of writing through it silently
  (2.1.287).** Before 2.1.287, a sandboxed session whose Bash tool wrote
  through a tracked symlink resolving outside the expected write area could
  modify the symlink's target with no permission prompt. On a public,
  fork-PR-driven repo this matters: a malicious contribution could commit a
  symlink inside the checkout pointing at a path meant to stay protected —
  the same class of file the 2.1.247 symlink-deletion fix and
  `blockReadsOutsideWorkingDirectories` (below) already guard, such as a
  `PM_ACCESS_TOKEN` credentials file living outside the checkout. Update
  Claude Code; [`.claude/settings.json`](../../.claude/settings.json)'s
  existing rules need no change — this closes a gap in enforcement, not a
  rule to rewrite. Noted in
  [Troubleshooting](troubleshooting.md#sandboxed-commands-claude-code).
- **Documented: sandboxed Bash deny/ask rules could miss a command prefixed
  with an environment-variable assignment under auto-mode's sandbox
  auto-allow (2.1.289).** Before 2.1.289, a command shaped like `FOO=bar git
  push --force origin main` could evade a deny rule written as `Bash(git
  push --force *)` — exactly one of this repo's two
  [`.claude/settings.json`](../../.claude/settings.json) deny entries
  (`Bash(git push --force *)`, `Bash(git push -f *)`), there specifically so
  an auto-mode session can never force-push to `main` per
  [constraint #2](../../.claude/rules/constraints.md). Fixed in 2.1.289;
  update Claude Code, the deny entries themselves need no change. Noted in
  [Troubleshooting](troubleshooting.md#sandboxed-commands-claude-code).
- **Reviewed, re-verified: `claude plugin validate`'s 2.1.290 additions
  (reporting of gating hooks and `.catch` presence under `--json`, as
  `gatingHooks`).** Re-ran `claude plugin validate .` and `claude plugin
  validate .claude-plugin/plugin.json` on 2.1.293 itself: both still pass.
  This repo's manifests define no hooks of their own, so there is nothing for
  the new check to report on.
- **Reviewed, a genuinely new surface but not adoptable yet: Claude Mods
  (2.1.287, extended through 2.1.292).** Plugins can now modify deeper Claude
  Code behavior — a new `$.tool.register`/`$.ui.*`/`$.model.complete` hook
  surface for a plugin's own live panes, status lines, toasts, and tool
  schemas. This repo's single plugin is intentionally four prompt-only slash
  commands with no hooks or deeper behavior today; a mod could, say, surface
  this repo's own build/verify status in a status line, but that is a new
  plugin component with its own design and review surface, not a one-line
  config change — tracked in Future opportunities rather than added here.
- **Reviewed, not applicable: Claude Haiku 5.5 and the new default Haiku
  model, `agentType`/`isDeferred` mod fields, the `Agent` tool `effort`
  parameter, `agent.spawn` workflow-agent support, prompt caching in
  `$.model.complete`, and the Claude apps gateway/OTel additions across
  2.1.287–2.1.293 (local-stdio MCP protocol-negotiation default,
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`/
  `CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS`, the `WebSearch` refill rate,
  the `at_mention` OTel event cap, `managed-agents-onboard`).** This repo
  makes no model calls, defines no subagents, hooks, or mods, registers no
  MCP server or gateway, and sets no OpenTelemetry exporter of its own
  (constraint #4) — none of these has a hook here.
- **Reviewed, benefits automatically / no action: the rest of 2.1.287–
  2.1.293.** General session reliability and correctness fixes (the
  `NO_PROXY`/`HTTPS_PROXY` precedence fix, the HTTP MCP connection memory
  leak, the `CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS` unit-parsing fix, the
  MCP-tool-name length-limit fix, sandbox read-deny hardening, the UNC
  network-path approval-bypass security fix, and the reverted 2.1.281
  auto-mode denial-message change and 2.1.290 cloud-session-wakeup fix) and
  terminal/plugin-CLI/agents-view UI work (the `--marketplace` CLI flag
  aside, already adopted above) apply to any session on this repo the next
  time it pulls a newer Claude Code, with no config change needed.

**Claude Code notes (2.1.281 → 2.1.286).** `.claude-code-version` advances to
**2.1.286**, covering 2.1.282, 2.1.283, 2.1.284, 2.1.285, and 2.1.286 — all
five were published as their own entries, no gap this time. Registration,
sandboxing configuration shape, and command-argument handling are unchanged.
One item is adopted, one is documented because it changes real behavior for
this repo's own commands, two are reviewed with no repo change needed, and
everything else is either a
managed-org/gateway/Bedrock/Vertex/Foundry/Cowork/Artifact/self-hosted-runner
surface [constraint #4](../../.claude/rules/constraints.md) rules out (or
[constraint #5](../../.claude/rules/constraints.md)), or host-side UI/
reliability work with no hook into this repo's four prompt-only commands:

- **Adopted: a dedicated `verify` skill, so Claude Code's own commit
  guidance runs it automatically (2.1.286).** 2.1.286 changed Claude's
  commit guidance: "when your project or user skills include one named
  `verify`, Claude is now told to run it right before committing, except
  for docs-only and tests-only commits." New
  [`.claude/skills/verify/SKILL.md`](../../.claude/skills/verify/SKILL.md)
  runs this repo's build/test/lint gate (the same three commands
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md)
  already scripted as steps 2–4 of its five). `run-production-master`
  keeps its own name and stays the complete pre-PR gate — clean `npm ci`
  plus install-manifest validation on top of build/test/lint — and is
  unchanged; `verify` is additive, not a rename, so every existing link to
  `run-production-master` in this repo's history and docs still resolves.
  The practical win: a contributor no longer has to remember to ask for the
  gate, or rely on [AGENTS.md](../../AGENTS.md) being read and followed —
  Claude Code 2.1.286+ invokes `verify` itself before committing anything
  that touches code.
- **Documented, no longer applicable: plugin `allowed-tools` pre-approval
  under managed `allowManagedPermissionRulesOnly` (2.1.284).** As of 2.1.284,
  a plugin's own `allowed-tools` pre-approval only applies under an
  organization's `allowManagedPermissionRulesOnly` policy for a plugin from
  an official Anthropic source or one the organization's managed settings
  explicitly vouch for. This plugin's commands now declare no
  `allowed-tools` at all and pre-approve nothing — Claude asks before each
  tool call — so the policy changes nothing for them. Noted in
  [Troubleshooting](troubleshooting.md#mcp-registration-issues).
- **Reviewed, attempted but unavailable here: `/doctor prompt-audit`
  (2.1.283).** New in 2.1.283, it audits CLAUDE.md-equivalents, skills,
  agents, and commands for prompting patterns written for older models —
  exactly the surface this repo's [AGENTS.md](../../AGENTS.md),
  [`commands/`](../../commands), and
  [`.claude/skills/`](../../.claude/skills) occupy. Running it in this
  session refused: it hands off to the bundled `claude-api` skill, which
  isn't available here (disabled, or bundled skills are off entirely). Done
  by hand instead: AGENTS.md, all five command files' frontmatter and
  prose, and both skills' SKILL.md were read looking for stale
  chain-of-thought prompting, threat/bribe framing, or other patterns the
  audit flags — none of that is present; the existing prose is already
  plain, imperative, and short. Worth re-running for real once `claude-api`
  is available in a session that has it, as a periodic check rather than a
  one-time gate.
- **Reviewed, no change needed: `claude plugin validate`'s 2.1.283
  additions (plugin/marketplace names Claude Code can't install now fail
  validation; missing or out-of-directory `outputStyles`/`themes`/
  `monitors`/`lspServers` paths now fail; `claude plugin details` no longer
  undercounts declared MCP servers).** Re-ran `claude plugin validate .`
  and `claude plugin validate .claude-plugin/plugin.json` on 2.1.286 (this
  PR bundles the new `verify` skill): both still pass. None of the new
  checks has anything to catch here — the manifests declare no
  `outputStyles`, `themes`, `monitors`, or `lspServers`, and no `mcpServers`
  entry (this plugin registers via `/plugin install`, never as an MCP
  server of its own), so `claude plugin details`'s server count was never
  wrong for it in the first place.
- **Reviewed, not applicable: Claude Sonnet 5.5 and the new default Sonnet
  model, `claude plugin configure`/`--config` for bundled `.mcpb` MCP
  servers, `allowedProviders`, and the Claude apps gateway additions across
  2.1.282–2.1.285 (`store.readiness_grace_seconds`, `load_test_mode`,
  `mantle` upstream, `x-claude-code-prompt-id`, `availableModelsMatch`,
  `deniedModels`, `auth: { google: {} }`, certificate client auth).** This
  repo makes no model calls and runs no MCP server or gateway of its own
  (constraint #4) — none of these has a hook here.
- **Reviewed, benefits automatically / no action: the rest of
  2.1.282–2.1.286.** General session reliability and correctness fixes
  (resume/retry handling, credential-redaction hardening, plugin
  cache-miss/record-loss recovery, `claude plugin marketplace`/`uninstall`
  bookkeeping, Windows Bash `PATH` de-duplication with many plugins
  enabled, SSH program selection for plugin/marketplace git operations) and
  terminal/VSCode/Cloud-session/Claude-Tag/Code-Review UI work apply to any
  session on this repo the next time it pulls a newer Claude Code, with no
  config change needed.

**Claude Code notes (2.1.278 → 2.1.281).** `.claude-code-version` advances to
**2.1.281**, covering 2.1.280 and 2.1.281 (2.1.279 was never published as a
separate entry). Registration, sandboxing configuration shape, and
command-argument handling are unchanged. Two 2.1.280 fixes and three 2.1.281
items touch this repo's own plugin/skill/settings surface directly enough to
document, and everything else is either a
managed-org/gateway/Bedrock/Vertex/Foundry/Cowork/Artifact/self-hosted-runner
surface [constraint #4](../../.claude/rules/constraints.md) rules out (or
[constraint #5](../../.claude/rules/constraints.md), for the self-hosted-runner
item), or host-side UI/reliability work with no hook into this repo's five
Bash-only commands:

- **Documented: `installed_plugins.json` could lose its recorded commit after
  a GitHub-repo-sourced plugin's `marketplace update` (2.1.280).** This
  repo is installed exactly this way —
  [Quick Start](quick-start.md#1-install-the-client-in-your-editor)'s
  `/plugin marketplace add ProductionMasterAI/production-master` +
  `/plugin install production-master@production-master` (or the 2.1.275+
  one-liner) — so a contributor running `/plugin marketplace update` on an
  existing install before 2.1.280 could see the plugin still installed but
  its pinned commit gone from `installed_plugins.json`, which matters for
  `--accept-command <sha256>` and for diagnosing "which build am I actually
  running" reports. Update Claude Code; no change to
  [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json)
  or [`plugin.json`](../../.claude-plugin/plugin.json) is needed — this was a
  host-side bookkeeping bug, not a manifest problem.
- **Documented: a `manifest.json` name collision could get a skill wrongly
  trashed (2.1.280).** This repo ships exactly one skill,
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md).
  Before 2.1.280, installing or syncing a second skill whose generated
  manifest entry collided by name with an existing one could delete the
  existing skill's files instead of just failing the install — worth knowing
  if `run-production-master` ever disappeared from a session unexpectedly
  after installing another plugin or syncing skills from elsewhere. Update
  Claude Code; the skill's own path and frontmatter need no change, and
  `syncClaudeAiSkills: false` in
  [`.claude/settings.json`](../../.claude/settings.json) (adopted in the
  2.1.278 note below) already keeps this repo's sessions from pulling in
  outside skills that could collide with it in the first place.
- **Reviewed, not applicable: Opus 5.5 and the Pro/Team-Standard default-model
  change to Opus (2.1.280).** This repo makes no model calls of its own
  (constraint #4) — model defaults and availability are an interactive
  contributor-session concern, not something this thin client configures or
  depends on.
- **Reviewed, not applicable: `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`
  (2.1.280).** Bounds how long a Claude Code MCP tool description can be
  before Claude Code's own MCP client truncates it. As
  [`cli.ts`](../../packages/adapter-claude-code/src/cli.ts) notes, this
  binary registers with Claude Code via `/plugin install`, never as an
  `.mcp.json` MCP server of its own — there is no Claude Code MCP tool
  description here for the new limit to bound.
- **Reviewed, not applicable: the `hook_execution_complete` OTel event's new
  output-size stats (2.1.280).** This repo defines no hooks under `.claude/`
  (constraint #4) and configures no OpenTelemetry exporter of Claude Code's
  own.
- **Reviewed, not applicable: background-subagent MCP tool messages no
  longer silently lost in headless/SDK sessions, and background-subagent LSP
  tool access (2.1.280).** This repo's five commands spawn no subagents
  (constraint #4).
- **Reviewed, not applicable: benign non-zero exits from background shell
  tasks no longer misreported as failures (2.1.280).** This repo defines no
  hooks or background Bash tasks under `.claude/` (constraint #4); its five
  commands each run a single foreground Bash invocation.
- **Reviewed, benefits automatically: the auto-mode safety-check
  retry-loop backoff, the symlink-write-path permission-rule fix, the `Write`
  tool alt-param-name validation fix, and the model-switch prompt-cache-miss
  fix (2.1.280).** General session reliability and correctness fixes with no
  repo-specific failure mode to reproduce — apply to any interactive session
  on this repo the next time it pulls a newer Claude Code, with no config
  change needed.
- **Reviewed, not applicable: cloud/self-hosted-runner reliability fixes
  (2.1.280).** Ruled out by [constraint #5](../../.claude/rules/constraints.md)
  — this repo's CI runs on GitHub-hosted `ubuntu-latest` runners only, never a
  self-hosted or cloud runner of its own.

- **Reviewed, no change: `claude plugin validate` now checks MCP servers,
  warns on unquoted `${CLAUDE_PLUGIN_ROOT}` in shell-form hooks, and stops
  flagging `privacyPolicyUrl`/`supportUrl` (2.1.281).** Ran
  `claude plugin validate .` and `claude plugin validate
  .claude-plugin/plugin.json` on 2.1.281: both pass. None of the new checks
  has anything to flag here — the plugin ships no `.mcp.json` (it registers
  via `/plugin install`, never as an MCP server of its own), no hooks, and
  the only `${CLAUDE_PLUGIN_ROOT}` uses are inside the five
  [`commands/`](../../commands) markdown bash blocks, which are not
  shell-form hooks and already use the `"${CLAUDE_PLUGIN_ROOT:-$(pwd)}"`
  quoted form. The command is still a useful local pre-flight for a
  manifest change; it is not wired into CI (that would be the
  `claude plugin eval` follow-up flagged in the PR).
- **Reviewed, kept the object form: `"attribution": false` in `settings.json`
  (2.1.281).** [`.claude/settings.json`](../../.claude/settings.json) keeps
  `"attribution": { "commit": "Co-Authored-By: Claude <noreply@anthropic.com>" }`
  deliberately: the repo *wants* a commit trailer, and 2.1.281 notes older
  CLI versions skip a settings file holding the boolean form, so the object
  form is also the safe one for a file shared across contributors' versions.
- **Reviewed, not applicable: `--agents` JSON file path (2.1.281),
  `sandbox.network.allowLocalBinding` (2.1.281), `mcp_tool` hooks on blocking
  events waiting for MCP connect (2.1.281), MCP URL-mode elicitation
  (2.1.281).** This repo spawns no subagents, sets no `sandbox` block, defines
  no hooks, and registers no MCP server (constraint #4).
- **Reviewed, benefits automatically / no action: the auto-mode changes
  (2.1.281).** The dangerous-`rm` prompt now times out after 2 minutes and
  denies with a rewrite hint in auto/`--dangerously-skip-permissions` mode
  (`CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1` turns it off), a recursive
  `rm` of command-substitution output now prompts, and
  `CLAUDE_CODE_AUTO_MODE_SERVER` now also applies on a direct Anthropic API
  connection. These are contributor-session behaviors: no `.claude/settings.json`
  permission rule here allows `rm`, so nothing needs to change.
- **Reviewed, not applicable: self-hosted-runner system prompts as private
  files (2.1.281).** Wrappers appending `--system-prompt` must switch to
  `--system-prompt-file`. [Constraint #5](../../.claude/rules/constraints.md)
  rules out self-hosted runners; [`claude.yml`](../../.github/workflows/claude.yml)
  runs `anthropics/claude-code-action@v1` on GitHub-hosted runners.
- **Reviewed, not applicable: Claude apps gateway (`assume_role`, `guardrail`,
  `telemetry.resource_attributes`, `desktop` policy keys, `envHelper` path
  refusal), Artifact tool loading scripts from `unpkg.com`, and the
  VSCode / Claude Code on the web / Claude Tag / Code Review sections
  (2.1.281).** Managed-org/gateway/Artifact/host surfaces
  constraint #4 rules out. The remaining 2.1.281 fixes (session resume,
  proxy-stream handling, plugin CLI scope resolution, `/plugin`, vim mode,
  and TUI polish) are host-side reliability work that reaches this repo
  through a newer Claude Code with no config change.

Everything else in 2.1.280 — the Artifact-tool policy-load/republish-DB-rules
fixes (constraint #4, no Artifact usage), and the VSCode, Claude Code on the
web, and Claude Tag (Slack) sections — is either a managed-org/Cowork/Artifact
surface constraint #4 rules out or a host surface this repo's Claude Code path
never uses: as the 2.1.273 note below already established, this repo is used
from a terminal or from
[`claude.yml`](../../.github/workflows/claude.yml)'s comment-triggered
`anthropics/claude-code-action@v1` job, never the VS Code extension, Claude
Code on the web, or Claude in Slack. Nothing here changes registration,
sandboxing shape, or command-argument handling beyond the two documented
fixes above.

**Claude Code notes (2.1.274 → 2.1.278).** `.claude-code-version` advances to
**2.1.278**, covering 2.1.275, 2.1.277, and 2.1.278 (2.1.276 was never
published as a separate entry). Registration, sandboxing configuration
shape, and command-argument handling are unchanged. Three items are
adopted, one is a required compatibility check, and everything else is
either a managed-org/gateway/Bedrock/Vertex/Foundry/Enterprise surface
[constraint #4](../../.claude/rules/constraints.md) rules out or host-side
UI/reliability work with no hook into this repo's four prompt-only commands:

- **Adopted: `AGENTS.md` as this repo's auto-loaded project instructions
  (2.1.277).** Claude Code now reads `AGENTS.md` for project instructions in
  any project with no `CLAUDE.md` — and this repo has neither. The hard
  constraints in
  [`.claude/rules/constraints.md`](../../.claude/rules/constraints.md)
  were already auto-loaded in Claude Code sessions: Markdown under
  `.claude/rules/` is project instruction even without a `CLAUDE.md`, so a
  session never had to be told to go read them. New root
  [`AGENTS.md`](../../AGENTS.md) is the 2.1.277 fallback surface and a
  shared convention other agent tools read, so the scope boundary, the
  no-force-push/no-unreviewed-workflow-edits rules, and the host-neutral-core
  seam are visible to every tool that looks for `AGENTS.md`, not only to
  Claude Code's rules loader. `constraints.md` remains the source of
  truest detail and is linked from it. This is a documentation-visibility
  and interoperability win, not a behavior change: nothing about
  registration or the five commands moves.
- **Adopted: `syncClaudeAiSkills: false` / `syncClaudeAiPlugins: false` in
  `.claude/settings.json` (2.1.275).** Claude Code now syncs the skills and
  plugins enabled on a person's own claude.ai account into their terminal
  sessions by default. For most repos that's a convenience; for this
  public, scope-bounded thin client — whose CI already runs an `ip-guard`
  and a no-LLM-SDK-import check specifically because arbitrary code can land
  in a PR — an unreviewed, per-contributor set of personal skills/plugins
  silently entering the tool surface of every session on this repo is exactly
  the kind of drift constraint #4 exists to prevent. Both settings are now
  explicitly `false` in
  [`.claude/settings.json`](../../.claude/settings.json), so every
  contributor's session sees the same allow-listed, reviewable tool surface
  regardless of what is enabled on their own account.
- **Adopted: the one-line `/plugin install <plugin> --marketplace <source>`
  form in Quick Start (2.1.275).** The two-step
  `/plugin marketplace add …` + `/plugin install …@…` sequence still works and
  remains the primary documented path, but
  [Quick Start](quick-start.md) now also shows the 2.1.275+ one-liner
  (`/plugin install production-master --marketplace
  ProductionMasterAI/production-master`) as a faster alternative for anyone
  already on 2.1.275+. No adapter or registration change — install ergonomics
  only.
- **Reviewed, compatibility-required: the removed `TaskOutput` tool
  (2.1.277).** Searched `commands/`, `packages/`, and `.claude/` for any
  reference — none exists. This repo's four slash commands
  ([`commands/`](../../commands)) are prompt-only, run no local commands,
  and never call `TaskOutput` (or any Task-family tool) directly, so the removal
  needs no migration here.
- **Reviewed, not applicable: `CLAUDE_GATEWAY_PROXY_IS_EGRESS_BOUNDARY=1` and
  the gateway upstream `headers:` map (2.1.277).** No Claude apps gateway of
  this repo's own (constraint #4) — this binary talks to the hosted
  service's own MCP gateway over its own HTTP transport, not Claude Code's
  gateway feature.
- **Reviewed, not applicable: auto mode's server-side classifier default and
  `CLAUDE_CODE_AUTO_MODE_SERVER=0` (2.1.278).** Only changes billing/behavior
  for API/Enterprise/Bedrock/Vertex/Foundry/gateway auto-mode sessions, none
  of which this repo configures (constraint #4); the new "Auto mode server"
  `/status` row is informational only.
- **Reviewed, not applicable: the send-now key, and the plugin/marketplace
  secret-in-URL and `marketplace update` deletion-on-fetch-failure fixes
  (2.1.275).** Host-side terminal UI and marketplace-client reliability with
  no repo-specific config to change — the fixes apply automatically the next
  time a session pulls a newer Claude Code.
- **Reviewed, not applicable: reliability fixes to Grep/Glob/Write/Edit,
  plugin install/reload, and sandboxed Bash (2.1.277).** General session
  reliability with no repo-specific failure mode to reproduce — applies
  automatically, no config change needed.

Everything else in 2.1.275–2.1.278 is either a managed-org/gateway/Bedrock/
Vertex/Foundry/Enterprise surface constraint #4 rules out or host-side UI/
reliability work with no hook into this repo's four prompt-only commands or its
[`.claude/settings.json`](../../.claude/settings.json). Nothing here changes
registration, sandboxing shape, or command-argument handling beyond the two
settings adopted above.

**Claude Code notes (2.1.273 → 2.1.274).** `.claude-code-version` advances to
**2.1.274**, a single release. Registration, sandboxing configuration shape,
and command-argument handling are unchanged. Nothing in this delta is
adopted — one bug fix is general reliability that benefits automatically,
and everything else is either a managed-org/gateway/MCP-as-client/
subagent/hook surface [constraint #4](../../.claude/rules/constraints.md)
rules out or this repo doesn't exercise, or host-side UI/telemetry work
with no hook into this repo's four prompt-only commands:

- **Reviewed, benefits automatically: the fix for stuck retry loops on
  `tool_use_id` errors (2.1.274).** General session reliability with no
  repo-specific failure mode to reproduce — applies to any session on this
  repo the next time it pulls a newer Claude Code, with no config change
  needed.
- **Reviewed, not applicable: the MCP HTTP+SSE 4xx-handling, ~5-minute
  Streamable-HTTP tool-call timeout, and `listChanged`-dependent
  resources/prompts-refresh fixes (2.1.274).** As in the 2.1.268 MCP-secret-
  masking note above, this repo defines no `.mcp.json`/MCP server
  registration of its own for Claude Code —
  [`cli.ts`](../../packages/adapter-claude-code/src/cli.ts) notes this
  binary *is* the MCP client (plugin-core's `HttpMcpToolTransport`) calling
  the hosted service's own MCP gateway, a separate transport from Claude
  Code's own built-in MCP client that these three fixes change — so none of
  them has a registered server here to fix.
- **Reviewed, not applicable: `CLAUDE_CODE_MCP_STARTUP_WAIT_MS` (2.1.274).**
  Bounds how long a non-interactive first turn waits on MCP server startup.
  Same reasoning as above — no `.mcp.json` server of this repo's own for
  Claude Code to wait on.
- **Reviewed, not applicable: MCP client v2 as the default transport for
  Bedrock/Vertex/Foundry and telemetry-disabled sessions
  (`MCP_SDK_GENERATION=v1` / `MCP_PROTOCOL_NEGOTIATION=legacy` to opt out,
  2.1.274).** No Bedrock, Vertex, or Foundry usage here (constraint #4), and
  the default only matters to a session with a registered MCP server —
  which this repo has none of for Claude Code, independent of whether
  telemetry happens to be disabled.
- **Reviewed, not applicable: leaner inline `/code-review` prompts
  replacing subagent fan-out, for every model (2.1.274).** This repo defines
  no `/code-review` workflow of its own, as already noted in the 2.1.272 and
  2.1.273 entries below.
- **Reviewed, not applicable: the OTel `effort` span attribute and the
  `claude_code.managed_settings_resolved` event (2.1.274).** This repo
  configures no OpenTelemetry exporter of Claude Code's own (constraint #4)
  and no managed settings, so neither addition has a repo-specific signal to
  carry.
- **Reviewed, not applicable: hook-driven sessions like `/goal` hitting
  "prompt too long" instead of compacting (2.1.274).** This repo defines no
  hooks under `.claude/` (constraint #4).
- **Reviewed, not applicable: `claude agents` losing `--model`/`--effort`/
  `--permission-mode` after an auto-update, and subagent model mismatches on
  Bedrock/Vertex/Foundry (2.1.274).** This repo's contributor workflow is
  fork-and-branch, per [CONTRIBUTING.md](../CONTRIBUTING.md), never `claude
  agents` teleport/worktrees, and its five commands spawn no subagents
  (constraint #4); no Bedrock/Vertex/Foundry usage either.
- **Reviewed, not applicable: the visible low-memory warning with recovery
  steps (2.1.274).** Host-side terminal UI with no
  [`.claude/settings.json`](../../.claude/settings.json) field or command
  surface for this repo to hook into.

Everything else in 2.1.274 is either a managed-org/gateway/MCP-as-client/
subagent/hook surface constraint #4 rules out or this repo doesn't
exercise, or host-side UI/reliability work with no hook into this repo's
four prompt-only commands or its
[`.claude/settings.json`](../../.claude/settings.json). Nothing here
changes registration, sandboxing shape, or command-argument handling.

**Claude Code notes (2.1.272 → 2.1.273).** `.claude-code-version` advances to
**2.1.273**, a single release. Registration, sandboxing configuration shape,
and command-argument handling are unchanged. One 2.1.273 fix widens a gap in
the same guarantee the 2.1.271 compound-command fix already documented below
(now called out in
[Troubleshooting](troubleshooting.md#sandboxed-commands-claude-code) above);
most of 2.1.273's published "New Features" list is a verbatim republish of
2.1.271's — already reviewed and ruled not applicable in the note below —
and everything genuinely new this release is either a gateway/MCP-server/
Remote-Control surface constraint #4 rules out or host-side UI/reliability
work with no hook into this repo's four prompt-only commands:

- **Documented: a Bash command the permission checker can't fully analyze
  could still skip the `permissions.blockReadsOutsideWorkingDirectories`
  prompt, and a subshell could hide a dangerous `rm` in bypass mode
  (2.1.273).** This narrows the same gap the 2.1.271 note below closed for
  two-`cd`/subshell/`cd`+`git` command shapes specifically: 2.1.273 covers
  the broader class of commands the checker can't fully parse. This repo
  sets `blockReadsOutsideWorkingDirectories: true` in
  [`.claude/settings.json`](../../.claude/settings.json) precisely so a
  stray read can't reach a `PM_ACCESS_TOKEN` credentials file living
  outside the checkout; update Claude Code, the setting itself needs no
  change.
- **Reviewed, not applicable: gateway hint headers
  (`x-claude-code-request-class` and friends, 2.1.273), the MCP-server-
  disconnect `/mcp` notification (2.1.273), and forking a `--remote-control`
  session (2.1.273) — the three items new in 2.1.273's feature list.**
  Gateway hint headers need a Claude-apps-gateway session of this repo's
  own; [`claude.yml`](../../.github/workflows/claude.yml) authenticates
  `anthropics/claude-code-action@v1` with a plain `ANTHROPIC_API_KEY`, no
  gateway (constraint #4, as in every earlier gateway note above). The MCP
  notification needs an `.mcp.json` server registered for Claude Code,
  which this repo has none of — its Claude Code path execs a binary from
  `commands/`, never MCP (see the 2.1.229 note below). Forking needs a
  Remote Control session, which this repo runs none of (same as the
  2.1.271 Remote-fast-mode note below).
- **Reviewed, not applicable: the reverted 2.1.268 `Read()`/`Edit()`-deny-
  on-unanalyzable-Bash-line check (2.1.273).** 2.1.273 reverts a 2.1.268
  change that applied `Read()`/`Edit()` deny rules to Bash lines the
  checker can't fully parse (`eval`, `env -C`); such commands prompt again
  instead of being silently denied. [`.claude/settings.json`](../../.claude/settings.json)
  sets no `Read()`/`Edit()` deny rules of its own — only the two
  `Bash(git push --force *)`/`Bash(git push -f *)` Bash deny entries — so
  neither the original 2.1.268 behavior nor this revert changes anything
  this repo's allow/deny list produces.
- **Reviewed, republished verbatim from 2.1.271, already ruled not
  applicable: Remote fast mode, `/config` mouse support,
  `self-hosted-runner --drain-marker-file`, per-command `allowed_domains`,
  `omitClaudeMd`, `--accept-command <sha256>`, and the `modelPricing`
  multiplier above 1.** See the individual entries under the 2.1.271 note
  below — nothing changed for this repo's review of any of them between
  2.1.271 and 2.1.273.
- 2.1.272 shipped only "bug fixes and reliability improvements," with no
  further detail published — nothing to review there, as already noted
  below.
- Everything else in 2.1.273 — the Bug Fixes list (the claude.ai-synced-
  skills-off cleanup, no synced skill here — see the 2.1.270 note below;
  the `allowManagedMcpServersOnly`/`deniedMcpServers`/
  `disableClaudeAiConnectors` managed-settings fix, no managed settings
  here; Bedrock/Vertex/Foundry 401/403 messaging, no gateway; the
  scheduled-task-wrong-session, agent-team/`/tui`, and background-subagent
  stream-json fixes, no scheduled tasks, agent teams, or subagents here;
  and the remaining terminal/spinner/`.git/info/exclude`/macOS-screenshot
  cosmetics), the Improvements list (Artifact-tool, `/autofix-pr`, and
  `/web-setup` error-message polish — constraint #4, no Artifact usage and
  neither command used here), the Changes list (the Bedrock/Vertex/Foundry
  auto-mode classifier default, `OTEL_LOG_TOOL_DETAILS` agent/skill/plugin
  naming, claude.ai-plugin sign-in scope, and `/bug`/`/feedback`
  report-field trimming — no gateway, no OTEL exporter, no plugin-access
  sign-in flow of this repo's own to affect), and the Platform-Specific
  VSCode/Windows/Claude-Code-on-the-web/Claude-Tag(Slack)/Code-Review
  sections (this repo is used from a terminal or from
  [`claude.yml`](../../.github/workflows/claude.yml)'s comment-triggered
  `anthropics/claude-code-action@v1` job, never the VS Code extension,
  Claude Code on the web, Claude in Slack, or the separate auto-PR "Code
  Review" product those sections describe) — is either a managed-org/
  gateway/model-calling surface constraint #4 rules out or host-side UI/
  reliability work with no hook into this repo's four prompt-only commands or
  its [`.claude/settings.json`](../../.claude/settings.json). Nothing here
  changes registration, sandboxing shape, or command-argument handling.

**Claude Code notes (2.1.270 → 2.1.272).** `.claude-code-version` advances to
**2.1.272**, covering 2.1.271 and 2.1.272. Registration, sandboxing
configuration shape, and command-argument handling are unchanged. Two 2.1.271
fixes touch this repo's own surface directly enough to document (both added
to [Troubleshooting](troubleshooting.md#sandboxed-commands-claude-code)
above); one 2.1.271 feature is informational only; everything else is either
a managed-org/gateway/Remote-Control/Workflow/Artifact/MCP-as-client surface
[constraint #4](../../.claude/rules/constraints.md) rules out, a
self-hosted-runner surface [constraint #5](../../.claude/rules/constraints.md)
rules out, or host-side terminal/UI/reliability work with no hook into this
repo's four prompt-only commands:

- **Documented: a stale `.git/config.lock` breaking `git checkout -b`,
  `git push -u`, and `git config` for the rest of a session after a
  sandboxed command failed to start (2.1.271, Linux).** This repo's
  allow-listed `Bash(git checkout *)`, `Bash(git branch *)`, and
  `Bash(git push origin *)` entries in
  [`.claude/settings.json`](../../.claude/settings.json) are exactly the
  commands this bug could break for the rest of an affected session. Update
  Claude Code; no allow-list change needed.
- **Documented: `Bash` commands with two directory changes, a subshell, or a
  `cd`+`git` chain could skip the `permissions.blockReadsOutsideWorkingDirectories`
  prompt in bypass and auto mode (2.1.271).** This repo sets
  `blockReadsOutsideWorkingDirectories: true` in
  [`.claude/settings.json`](../../.claude/settings.json) (adopted in the
  2.1.257 note below) specifically so a stray auto-mode read can't reach a
  `PM_ACCESS_TOKEN` credentials file living outside the checkout; this fix
  closes a bypass of that same guarantee reachable through a compound Bash
  command rather than a single one. Update Claude Code; the setting itself
  needs no change.
- **Reviewed, informational only: per-command `allowed_domains` for `Bash`
  in auto mode with sandboxing (2.1.271).** Lets a single sandboxed Bash
  invocation be scoped to only the network hosts that one command needs,
  reviewed and opened for it alone, narrower than the session-wide
  `sandbox.network.strictAllowlist` entry this repo's docs already recommend
  for `api.productionmaster.dev` (or a custom `PM_SERVICE_URL` host — see
  [Troubleshooting](troubleshooting.md#sandboxed-commands-claude-code)).
  Each of this repo's five commands makes exactly one such Bash call, so an
  auto-mode session can now grant that call network access without a
  broader Bash network allowlist. This is host-side, per-invocation
  behavior — no `.claude/settings.json` field to set — so it is documented
  in Troubleshooting rather than adopted as a config change here.
- **Reviewed, not applicable: `omitClaudeMd` agent frontmatter and
  `--agents` JSON (2.1.271).** Lets a custom or plugin subagent run without
  inheriting CLAUDE.md files. This repo defines no subagents of its own —
  constraint #4, no pipeline/agent logic — so there is no agent frontmatter
  for the new field to appear in.
- **Reviewed, not applicable: `--accept-command <sha256>` on `claude plugin
  install`/`update` (2.1.271).** As with the 2.1.268 `--json` note above,
  this repo's single plugin is installed by the end user with `/plugin
  install production-master`; no script in this repo shells out to `claude
  plugin install`/`update` for there to be a displayed command to accept.
- **Reviewed, not applicable: the Claude apps gateway `modelPricing`
  `multiplier` (2.1.271) and the Bedrock/Vertex/Foundry desktop-app spinner
  tip (2.1.271).** This repo makes no model calls of its own (constraint
  #4) — no gateway pricing to mark up, no Bedrock/Vertex/Foundry session of
  this repo's own for the tip to appear in.
- **Reviewed, not applicable: Claude Code Remote fast mode (2.1.271) and the
  `Workflow` tool's fixed watch deadline (2.1.271).** This repo runs no
  Remote sessions and uses no `Workflow` tool script or `Monitor` watch of
  its own — constraint #4, no pipeline/agent logic.
- **Reviewed, benefits automatically: the settings-file-change polling
  fallback on saturated macOS systems (2.1.271); the Bash permission-check
  hardening for wildcard-expanded file arguments and shell-variable
  declaration flags (2.1.271); and terminal-rendering/startup-time
  improvements (2.1.271).**
  [`.claude/settings.json`](../../.claude/settings.json) is watched for
  external changes like any other project settings file, and this repo's
  Bash allow list is exercised by contributors and by
  [`.github/workflows/claude.yml`](../../.github/workflows/claude.yml) — none
  of these had a repo-specific failure mode to reproduce, but the general
  reliability and performance work applies to any session on this repo with
  no config change.
- **2.1.272 shipped only "bug fixes and reliability improvements," with no
  further detail published — nothing to review there.**
- Everything else in the 2.1.271/2.1.272 delta — the `/config` panel mouse
  support, `claude self-hosted-runner --drain-marker-file` (constraint #5,
  GitHub-hosted `ubuntu-latest` runners only), the cached-org-policy and
  tool-list-refresh fixes (no managed settings here), the `managed-mcp.json`
  exclusive-control fix and the `ANTHROPIC_UNIX_SOCKET` org-policy fix (no
  managed MCP config or custom local proxy in this repo's path), the cloud
  subagent-tool-call schema-validation fix (no subagents), `/fast off` and
  the `CLAUDE_CODE_RETRY_WATCHDOG` fast-mode fixes (no fast-mode
  configuration of this repo's own), the resumed `claude -p`
  MCP-only-tools fix and the MCP `list_changed`/OAuth/tool-search fixes (no
  `.mcp.json` of this repo's own for Claude Code, per the 2.1.268 MCP note
  below), cross-session-message delivery notices, background-command
  double-start-after-compaction, `/model`/`/reload-skills`/`/resume`/
  `/teleport`/`--resume` UI and state fixes (this repo's contributor
  workflow is fork-and-branch, never `--worktree`/`claude agents` teleport),
  Artifact-publish/watch fixes (no Artifact usage — constraint #4), the
  virtual-drive-inode-0 component-loading fix (this repo's `commands/` and
  `.claude/` load from a normal checkout, not an encrypted vault), the
  synced-skill-cleanup-after-sign-out fix (the
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md)
  skill is project-local, checked into this repo, never claude.ai-synced),
  and the remaining terminal-input/UI cosmetics and Foundry/Remote-Control/
  Cowork/dynamic-workflow items — is either a managed-org/model-calling/
  Cowork/Workflow/self-hosted-runner surface constraints #4/#5 rule out or
  this repo doesn't exercise, or host-side UI/reliability work with no hook
  into this repo's four prompt-only commands or its
  [`.claude/settings.json`](../../.claude/settings.json). Nothing here
  changes registration, sandboxing shape, or command-argument handling.

**Claude Code notes (2.1.268 → 2.1.270).** `.claude-code-version` advances to
**2.1.270**, covering 2.1.269 and 2.1.270. Registration, sandboxing
configuration shape, and command-argument handling are unchanged. One item is
adopted, one closes a loop directly relevant to this repo's read-only-git
Bash allow rules, one is called out as a genuine (but not yet taken) option
for this repo's single plugin, and everything else is either a managed-org/
gateway/OTEL/Workflow/Cowork surface constraint #4 rules out or host-side
reliability work with no hook into this repo's four prompt-only commands:

- **Adopted: `bashEditDiffEnabled` (2.1.269).** When the Bash tool itself
  edits a file, Claude Code can now attach a diff of what changed to the
  Bash tool result instead of only the command's stdout/stderr. This repo's
  [`.claude/settings.json`](../../.claude/settings.json) allow-lists
  `Bash(npx prettier --write *)` — a Bash-tool-driven file edit, not an
  `Edit()`/`Write()` call — so before 2.1.269 a reformat run this way showed
  no diff at all in the transcript, only the (silent, on success) prettier
  exit. Set `bashEditDiffEnabled: true` in
  [`.claude/settings.json`](../../.claude/settings.json) so that reformat
  shows what it actually changed, the same visibility an `Edit()` call
  already gets. It is not limited to that one command: the allow list also
  carries `Bash(git checkout *)` and `Bash(git switch *)`, both of which can
  replace tracked working-tree files, so a Bash-driven checkout will now
  attach a diff too. The remaining Bash-only entries (`npm`, `make`,
  `node scripts/*`, and the read-only `git status`/`diff`/`log` probes) do not
  write files, and are unaffected.
- **Reviewed, notable but not newly adopted: the read-only-git
  permission-prompt regression (2.1.269) and its fix (2.1.270).** 2.1.269
  introduced a regression where read-only Bash git commands could
  unexpectedly ask for permission again after a session had been running for
  a while; 2.1.270 fixes it. This repo's
  [`.claude/settings.json`](../../.claude/settings.json) allow-lists exactly
  the commands this regression affects — `Bash(git status)`,
  `Bash(git diff *)`, and `Bash(git log *)` — used throughout the contributor
  workflow in [CONTRIBUTING.md](../CONTRIBUTING.md) and by the
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md)
  skill's verification steps. Nothing to change in the allow list itself —
  the rules were always correct — but this is why the version pin advances
  straight from 2.1.268 to 2.1.270 rather than stopping at 2.1.269: taking
  2.1.269 alone would have reintroduced spurious prompts on exactly the
  Bash commands this repo relies on running unattended in a long session.
- **Reviewed, a real option not taken yet: `claude plugin eval` (2.1.269).**
  Runs a plugin's eval suite against Claude Code and produces scored,
  reproducible JSON/HTML results. This repo's single plugin
  ([`.claude-plugin/plugin.json`](../../.claude-plugin/plugin.json) +
  [`commands/`](../../commands/)) has no automated eval or smoke-test suite
  today. CI runs the adapter's unit tests with coverage, the version-pin and
  changelog-structure guards, `secret-scan` and `ip-guard` — but nothing in CI
  or in the test suite reads `.claude-plugin/plugin.json` or the `commands/`
  manifests at all, so a malformed manifest passes CI today, and nothing
  exercises the four slash commands as Claude Code itself would invoke them. Not adopted here because an eval suite worth committing to
  needs deciding what a fixture-backed `PM_SERVICE_URL` for
  `/setup`/`/investigate`/`/connect`/`/update` looks like and what
  "correct" scores as, which is a design decision, not a config flip — see
  Future opportunities in the tracking PR for a concrete starting shape.
- **Reviewed, not applicable: `/output-style` (2.1.269).** Lets an
  interactive, Remote Control, or cloud/headless session list and switch
  output styles. This repo ships no output-style file of its own (per the
  2.1.238 note below) and defines no output-style guidance for any of its
  five commands — there is nothing here for `/output-style` to switch
  between beyond Claude Code's own built-ins.
- **Reviewed, not applicable: `OTEL_METRICS_INCLUDE_REPOSITORY` (2.1.269).**
  Tags a Claude Code session's own OpenTelemetry metrics/events with
  `vcs.*` repository attributes. This repo configures no OpenTelemetry
  exporter of Claude Code's own — constraint #4, no model-provider or
  telemetry surface of this repo's own to tag. (Unrelated to this thin
  client's own product terminology: `PM_MCP_GATEWAY_URL`/`--gateway` name a
  Production-Master-service concept, not a Claude Code OTEL/gateway
  setting.)
- **Reviewed, not applicable:
  `CLAUDE_CODE_GATEWAY_MODEL_DISCOVERY_TIMEOUT_MS` (2.1.269).** Extends the
  Claude-apps-gateway's `/v1/models` discovery timeout. As with the 2.1.266
  and 2.1.268 gateway notes above,
  [`claude.yml`](../../.github/workflows/claude.yml) authenticates
  `anthropics/claude-code-action@v1` with a plain `ANTHROPIC_API_KEY`
  secret — no Claude-apps gateway sits in front of it, so there is no
  model-discovery timeout of this kind to extend.
- **Reviewed, not applicable: `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`
  (2.1.269).** Raises the `Workflow` tool's per-run concurrent-agent limit.
  This repo uses no `Workflow` tool script of its own (constraint #4).
- **Reviewed, benefits automatically, and worth naming for this repo's own
  attribution setting: the attribution-reminder-override fix (2.1.269,
  SECURITY-adjacent).** Before 2.1.269, a session-level attribution reminder
  could override a repo's own CLAUDE.md/memory rule against commit/PR
  attribution. This repo's
  [`.claude/settings.json`](../../.claude/settings.json) does the opposite —
  it explicitly *sets* `attribution.commit` rather than disabling it — so
  the bug's failure direction (an unwanted override winning) was never
  visible here, but the fix confirms this repo's own explicit setting is now
  the one that wins over any external attribution reminder, short of a
  managed-settings override.
- Everything else in the 2.1.269/2.1.270 delta — the `claude plugin eval`
  and `/output-style` availability over Remote Control/cloud sessions
  themselves (constraint #4, no model calls of this repo's own); prompt-cache
  partial-invalidation and terminal-keybinding fixes (general reliability,
  benefits automatically); the remote/headless "waiting for your input"
  background-agent fix and its `CLAUDE_CODE_BG_TASKS_REPORT_RUNNING` revert
  flag (this repo's five commands spawn no background agents — constraint
  #4); `git status` after compaction now current (general reliability); the
  synced-plugin-MCP-servers-not-reconnecting fix (this repo's Claude Code
  path registers via `/plugin install` and execs a binary from `commands/`,
  never MCP — see the 2.1.229 note below); the SECURITY plugin-archive
  extraction permissions/world-writable/stale-file fixes (host-side plugin
  cache hardening, no repo-specific plugin archive of this repo's own beyond
  the one it ships); the SECURITY `Edit()`-deny/write-path and
  `Bash(tee:*)`-allow-rule fixes (this repo's
  [`.claude/settings.json`](../../.claude/settings.json) sets no `tee`
  allow rule and no `Edit()` deny rules of its own); organization plugins
  via managed settings not loading in headless sessions (no managed
  settings here); `/ultrareview --post` no longer spinning up a second
  cloud session (this repo uses no `/ultrareview` workflow); the Artifact
  database scratchpad-read approval change (constraint #4, no Artifact
  usage); and `anthropic-skills:<name>`-prefixed cloud-synced skills (the
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md)
  skill is project-local, checked into this repo, never claude.ai-synced) —
  is either a managed-org/model-calling/Cowork/Workflow surface constraint
  #4 rules out or this repo doesn't exercise, or host-side reliability/UI
  work with no hook into this repo's four prompt-only commands or its
  [`.claude/settings.json`](../../.claude/settings.json). Nothing here
  changes registration, sandboxing shape, or command-argument handling.

**Claude Code notes (2.1.267 → 2.1.268).** `.claude-code-version` advances to
**2.1.268**, a single release. Registration, sandboxing configuration shape,
and command-argument handling are unchanged. Nothing in this delta is
adopted:

- **Reviewed, not applicable: `--json` on `claude plugin
  install/uninstall/update/enable/disable`, plus `errorDetails`/
  `noteDetails` on `plugin list --json` rows (2.1.268).** This repo's single
  plugin — [`.claude-plugin/plugin.json`](../../.claude-plugin/plugin.json)
  — is installed by the end user with `/plugin install production-master`;
  no script or CI step in this repo shells out to `claude plugin` at all, so
  there is no output to reparse against the new JSON shape. Revisit only if
  a script here ever needs to script plugin lifecycle management itself.
- **Reviewed, not applicable: `claude self-hosted-runner
  --remove-session-state` (2.1.268).** Ruled out outright by constraint #5:
  this repo's CI runs on GitHub-hosted `ubuntu-latest` runners only, never a
  self-hosted runner, so there is no `_sessions/` state of this repo's own
  for the flag to clean up.
- **Reviewed, not applicable: the Claude-apps-gateway `pricing:` setting,
  its CIDR-allowlist startup warnings, and the `gatewayInternalNetworks`
  managed setting (2.1.268).** As with the 2.1.266
  `CLAUDE_CODE_USE_GATEWAY` note above,
  [`claude.yml`](../../.github/workflows/claude.yml) authenticates
  `anthropics/claude-code-action@v1` with a plain `ANTHROPIC_API_KEY`
  secret — no gateway sits in front of it, so gateway pricing, CIDR
  allowlisting, and gateway login all have no repo surface.
- **Reviewed, not applicable: task-tracking-tool model gating
  (`CLAUDE_CODE_ENABLE_TODO_TOOLS`) and the Artifact-tool permission-prompt/
  `WebFetch`-rule changes (2.1.268).** This repo makes no model calls of its
  own (constraint #4), and
  [`.claude/settings.json`](../../.claude/settings.json) sets neither a
  `WebFetch` nor an `Artifact` permission rule for the changed default
  scoping to affect.
- **Reviewed, not applicable: Bedrock/Vertex/Foundry system-prompt-as-
  attachments and tool-list-stability changes (2.1.268).** No Bedrock,
  Vertex, or Foundry usage here — constraint #4, no model-provider surface
  of this repo's own.
- **Reviewed, not applicable: MCP-secret-masking fixes across `/mcp`,
  `/plugin`, `claude mcp list`/`get`, MCP login errors, and the
  plugin/marketplace git-source-URL leak fix (2.1.268).** This repo defines
  no `.mcp.json`/MCP server configuration of its own for Claude Code and
  ships no marketplace catalog: as
  [`cli.ts`](../../packages/adapter-claude-code/src/cli.ts) notes, this
  binary *is* the MCP client (plugin-core's `HttpMcpToolTransport`) calling
  the hosted service's own MCP gateway — there is no separate host-side MCP
  server registration or marketplace entry of this repo's own for either
  fix to touch.
- **Reviewed, not applicable: the plugin-root-`SKILL.md`-silently-skipped
  fix (2.1.268).** This repo's skill lives at the standard nested
  [`.claude/skills/run-production-master/SKILL.md`](../../.claude/skills/run-production-master/SKILL.md)
  path, not a plugin-root `SKILL.md`, so the bug this fixes never applied
  here.
- **Reviewed, benefits automatically: the symlinked-directory (`/etc`,
  `/tmp`, `/var` on macOS; `/bin` on Linux) permission-rule-bypass fix, the
  `/compact`-summary and resumed-session note-ordering fixes, and the
  Bash-sandbox-prompt-wording fix (2.1.268).**
  [`.claude/settings.json`](../../.claude/settings.json) sets no deny/ask
  rules on those symlinked paths and no hooks, so none of these had a
  repo-specific failure mode — but general Claude Code
  reliability/security hardening improves for any interactive session on
  this repo with no config change needed, same pattern as prior currency
  bumps.
- Everything else in the 2.1.268 delta — `claude auth status --json`'s new
  `configDirectory` field, published-artifact browser-tab icons, the
  WebFetch timeout/`CLAUDE_CODE_WEBFETCH_DEADLINE_MS` addition, the
  in-process-teammate untrusted-agent-file fix, the idle-session CPU fix,
  the "message came through empty" post-MCP-tool-call fix (no `.mcp.json`
  of this repo's own for Claude Code, per the MCP-secret-masking note
  above), the SDK/`excludeDynamicSections` prompt-cache fix, stale
  model-access-denial and long-context-429 fixes (constraint #4, no model
  calls), the workload-identity-federation `jti reused` fix (`claude.yml`
  uses a plain `ANTHROPIC_API_KEY` secret, not a WIF profile), the MCP
  OAuth-redirect-port fix, `claude agents`/Remote Control/Slack/Chrome/
  `/resume`/cloud-session-command UI and messaging fixes, and the remaining
  terminal/UI cosmetics — is either a managed-org/subagent/Cowork/Workflow/
  self-hosted-runner surface constraints #4/#5 rule out or this repo doesn't
  exercise, or terminal/UI/reliability work with no hook into this repo's
  four prompt-only commands or its
  [`.claude/settings.json`](../../.claude/settings.json). Nothing here
  changes registration, sandboxing shape, or command-argument handling.

**Claude Code notes (2.1.263 → 2.1.267).** `.claude-code-version` advances to
**2.1.267**, covering 2.1.265, 2.1.266 (a same-day regression fix for
2.1.265's `CLAUDE_CODE_USE_GATEWAY` breaking API-key/custom-auth setups —
[`claude.yml`](../../.github/workflows/claude.yml) authenticates
`anthropics/claude-code-action@v1` with a plain `ANTHROPIC_API_KEY` secret,
not the gateway, so both the regression and its fix pass through with no
repo-visible effect), and 2.1.267. Registration, sandboxing configuration
shape, and command-argument handling are unchanged. Nothing in this delta is
adopted — the closest candidates are reviewed below and ruled out by
constraint #4 or by this repo's existing single-plugin/no-`.mcp.json` shape,
not adopted with a config change:

- **Reviewed, not applicable: `--plugin-dir` pointing at a folder of
  plugins (2.1.265).** This repo ships exactly one Claude Code plugin —
  [`.claude-plugin/plugin.json`](../../.claude-plugin/plugin.json), installed
  with `/plugin install production-master` — not several local plugins a
  contributor loads together, so there is no folder of sibling plugin
  directories for the new flag to point at. Revisit only if a second,
  separate plugin is ever added to this repo.
- **Reviewed, not applicable: `maxEffortLevel` (2.1.267).** An org/user
  ceiling on `/effort`. This repo makes no model calls of its own (constraint
  #4) and [`.claude/settings.json`](../../.claude/settings.json) sets no
  effort-related guardrail for `maxEffortLevel` to replace or simplify —
  there is nothing here in that category to begin with.
- **Reviewed, not applicable: plugin-path and marketplace-entry backslash
  symlink-containment fixes (2.1.265, 2.1.267, both SECURITY).** Host-side
  hardening against a plugin or marketplace-catalog path crafted with a
  backslash to escape its containment check. This repo ships a single
  plugin manifest directly (no marketplace catalog of its own, per the
  2.1.259→2.1.263 note below) and defines no plugin paths of its own for
  either bypass to reach.
- **Reviewed, benefits automatically: resume-after-crash prompt/tool-state
  fixes; the many prompt-cache stability fixes (2.1.265, 2.1.267).** Fixing
  resumed sessions rewriting the last prompt or mis-marking an interrupted
  tool, and a long list of prompt-cache-reuse regressions tied to
  subagent/MCP-tool-set churn on resume. This repo's five commands spawn no
  subagents and register no `.mcp.json` of their own (constraint #4), so the
  specific regressions never had a surface here — but the general
  resume/crash-recovery reliability improves for any interactive session on
  this repo regardless, with no config change needed.
- **Reviewed, not applicable: Cowork scheduled-task sandboxing startup fix;
  `Workflow` tool `agent()` large-output-schema fix (both 2.1.267).** This
  repo uses neither Cowork nor the `Workflow` tool.
- Everything else in the 2.1.265/2.1.267 delta — the `user.email`/
  `user.groups` gateway telemetry addition, the 1 GB tool-result disk cap,
  `--system-prompt-snapshot off`, the AWS/GCP credential-retry fix (no
  Bedrock/Vertex here — constraint #4), the managed
  `allowedHttpHookUrls`/`httpHookAllowedEnvVars`/`allowedChannelPlugins`
  fix (no managed settings), the `effort:` frontmatter fix (the
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md)
  skill's frontmatter sets no `effort:` field), VS Code/SDK re-login,
  background-session retirement, the advisor-tool and Artifact-tool fixes,
  `/add-dir` subdirectory, forked-skill streaming, legacy-SSE-only MCP
  fallback, `--worktree` startup, `/workflows` agent detail, slash-command
  matching, and the plugin-display-metadata (marketplace-over-`plugin.json`)
  change — is either a managed-org/subagent/Cowork/Workflow/self-hosted-runner
  surface constraints #4/#5 rule out or this repo doesn't exercise, or
  terminal/UI/reliability work with no hook into this repo's four prompt-only
  commands or its [`.claude/settings.json`](../../.claude/settings.json).
  Nothing here changes registration, sandboxing shape, or command-argument
  handling.

**Claude Code notes (2.1.259 → 2.1.263).** `.claude-code-version` advances to
**2.1.263**, covering 2.1.260, 2.1.261, and 2.1.263 (2.1.262 was never
published as a separate release). Registration, sandboxing configuration
shape, and command-argument handling are unchanged. Two fixes touch a
setting this repo already sets, one closes a loop opened by the 2.1.259 note
below, and one new setting is adopted; everything else is either a
managed-org/model-calling/subagent/self-hosted-runner surface constraints
#4/#5 rule out, or host session/UI/telemetry/Remote-Control work with no
client-relevant hit:

- **Fixed: `permissions.blockReadsOutsideWorkingDirectories` hiding the
  user's git config from sandboxed git on macOS (2.1.260).** This repo sets
  `blockReadsOutsideWorkingDirectories: true` in
  [`.claude/settings.json`](../../.claude/settings.json) (adopted in the
  2.1.257 note below). Before 2.1.260, the same setting could also block a
  sandboxed `git` invocation from reading `~/.gitconfig` on macOS — separate
  from this repo's own credentials, but worth knowing if a contributor's
  sandboxed `git status`/`git diff` (allowed in this repo's Bash allow list)
  behaved as if git had no user config on macOS. Update Claude Code; no
  change to `.claude/settings.json` needed. The fix's other half — a
  worktree-isolated sub-agent's own checkout no longer hidden from itself —
  doesn't apply here: this repo's contributor workflow is fork-and-branch,
  never `--worktree`, and its five commands spawn no sub-agents (constraint
  #4).
- **Closed loop: the 2.1.259 `Read()`-deny-rule-on-Bash-args change is
  reverted (2.1.260).** The 2.1.259 note below reviewed that change as not
  applicable because [`.claude/settings.json`](../../.claude/settings.json)
  sets no `Read()` deny rules of its own. 2.1.260 reverted it host-side
  after it denied plain commands like `npm run build` under an unrelated
  `Read()` rule in every mode. Still nothing to change here — recorded only
  so this repo's per-release history doesn't carry a live cross-reference to
  a behavior that no longer exists.
- **Adopted: `bashOutputMaxChars` in `.claude/settings.json` (2.1.261).**
  The [`run-production-master`
  skill](../../.claude/skills/run-production-master/SKILL.md) chains
  `npm ci`, `npm run build --workspaces`, `npm run test --workspaces`, and
  `npm run lint --workspaces` across this repo's workspaces in one sitting —
  combined output that can exceed the inline budget a Claude Code session
  gives a single Bash result before the rest is saved to a file and
  summarized instead of shown. Set to `65536` (2.1.261 raises the settable
  ceiling to 128K) so a full local verification run — in particular which
  of the four gates failed and its full stack trace — stays inline for the
  session instead of being truncated mid-skill. `taskOutputMaxChars` is not
  set: this repo defines no hooks or background Bash tasks under `.claude/`
  (constraint #4), so there is no background-task output for it to raise.
- **Reviewed, no repo change: `/skill-doctor` (2.1.261).** Lists loaded
  skills that go unused and what they cost in context — useful when
  iterating on
  [`run-production-master`](../../.claude/skills/run-production-master/SKILL.md),
  in the same no-op-until-you-ask-for-it category as `/doctor`'s
  stale-sandbox-mask-file warning noted in the 2.1.257 entry below. No
  frontmatter or trigger-phrase change needed.
- **Reviewed, benefits automatically: improved idle CPU usage of
  non-interactive (`-p`/SDK) sessions (2.1.260).**
  [`.github/workflows/claude.yml`](../../.github/workflows/claude.yml) runs
  `anthropics/claude-code-action@v1` on GitHub-hosted `ubuntu-latest`
  runners only (constraint #5) — a non-interactive session by construction.
  No workflow change; the improvement applies the next time the action pulls
  a newer Claude Code.
- Everything else in the 2.1.260/2.1.261/2.1.263 delta is either a
  managed-org, model-calling (`/model`, Fable 5.1, auto-compact, `/effort`,
  gateway/Bedrock/Vertex), subagent/agent-team, Remote Control, cloud-session,
  self-hosted-runner, or marketplace-catalog surface constraints #4/#5 rule
  out or this repo doesn't exercise (no managed settings, no `.mcp.json`, no
  hooks, no marketplace catalog of its own); or terminal/UI/reliability work
  (the diff panel, text-form `/advisor`, streaming performance, the `rm -rf`
  safety-prompt coverage, word-editing keybindings, `/context` token
  counting, `/reload-plugins` in headless sessions, and the full VS Code
  list) with no hook into this repo's four prompt-only commands or its
  [`.claude/settings.json`](../../.claude/settings.json). 2.1.263 itself
  shipped only "bug fixes and reliability improvements," with no further
  detail published. Nothing else here changes registration, sandboxing
  shape, or command-argument handling.

**Claude Code notes (2.1.258 → 2.1.259).** `.claude-code-version` advances to
**2.1.259**. Registration, sandboxing configuration shape, and
command-argument handling are unchanged. One item is adopted as a
documentation improvement for an already-supported use case; everything else
in the delta is either a managed-org/host-session surface this repo's
constraints rule out, or a fix with no client-relevant hit:

- **Adopted: `--permission-prompts none` for unattended headless runs.**
  [Troubleshooting → Sandboxed commands](troubleshooting.md#sandboxed-commands-claude-code)
  already documents seeding `PM_ACCESS_TOKEN` from a credentials file for
  headless setups (CI jobs, scheduled triggers) that run one of this
  plugin's five commands with no interactive session to answer a prompt.
  Before 2.1.259, anything outside
  [`.claude/settings.json`](../../.claude/settings.json)'s allow list that
  needed approval in such a run either stalled waiting on a prompt nothing
  could answer, or required `--permission-mode bypassPermissions` — which
  also waives the sandbox and file-tool protections that credentials file
  relies on. `--permission-prompts none` is a safer third option: the active
  permission mode keeps deciding what this repo's allow list auto-approves,
  but anything that would otherwise prompt is denied outright instead of
  hanging. Documented alongside the existing headless-token guidance in
  Troubleshooting so an unattended `/investigate`, `/connect`, or `/update`
  run fails cleanly on an unexpected prompt rather than hanging the job; no
  change to `.claude/settings.json` itself, since its allow list already
  covers this repo's four prompt-only commands.
- **Reviewed, not applicable: `managedMcpServers`, `managed
  forceRemoteSettingsRefresh`, and the "managed settings refuses to start
  when unparseable" hardening.** `managedMcpServers` lets an organization
  push HTTP/SSE MCP servers to every user via managed settings; this repo
  configures no managed settings and (per the 2.1.229/2.1.246 notes below)
  Claude Code registers this plugin via `/plugin install`, never as this
  client's MCP client — there is no `.mcp.json` or managed-MCP surface here
  for any of the three to apply to.
- **Reviewed, not applicable: `glab mr create/merge/close/reopen/note/update`
  recognition** in the collapsed tool summary and MR footer badge. This
  repo's five commands never shell out to `glab`; the Cursor Origin notes
  above discuss GitLab as a git-hosting option for *Cursor*, not as
  something Claude Code drives here.
- **Reviewed, not applicable: `claude plugin validate --json`.** This
  repo's own `check-version-pin-docs.mjs` and `check-changelog-structure.mjs`
  scripts — not `claude plugin validate` — are the CI gates on
  [`.claude-plugin/plugin.json`](../../.claude-plugin/plugin.json) and this
  repo's docs; adding a `claude plugin validate --json` CI step would mean
  installing the Claude Code CLI itself into `ci.yml` purely to validate a
  seven-field manifest, a new CI dependency this repo doesn't currently
  carry. Worth a look if the CLI's install footprint in CI ever needs
  justifying for another reason; not adopted on its own here.
- **Reviewed, not applicable: the Bash `Read()` deny-rule matching fix**
  (option-value paths, git diff/grep file operands, `cd && cat` compounds).
  Same family as the 2.1.251 symlink-bypass fix noted below —
  [`.claude/settings.json`](../../.claude/settings.json) sets no `Read()`
  deny rules of its own, so the matching gap this closes never had a rule to
  miss here.
- Everything else — the `~/.claude.json` concurrent-write, thinking-rejection,
  prompt-cache/OAuth-refresh, fullscreen-render, auto-mode/frontmatter-model,
  `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, `--resume`-attachment, OpenTelemetry-
  attribute, repository-detection, and Stop-hook/workflow-resume fixes; the
  background GitHub-connection check and Artifact-publish error fixes; the
  file-edit-dialog and MCP-tool-listing display fixes; the worktree-isolation
  and Bash-loop/xargs fixes (this repo's contributor workflow is
  fork-and-branch, per [CONTRIBUTING.md](../CONTRIBUTING.md), never
  `--worktree`); the terminal-resize, `/workflows`, headless/SDK-start-latency,
  `/install-github-app`, nested-subagent-transcript, `allowedMcpServers`, and
  VS Code session-list fixes — is host session, UI, telemetry, or
  managed-settings machinery this repo's four prompt-only commands never
  exercise (constraint #4), or (the self-hosted-runner and worktree items)
  ruled out by constraints #4/#5 directly. Nothing else here changes
  registration, sandboxing shape, or command-argument handling.

