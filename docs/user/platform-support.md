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

