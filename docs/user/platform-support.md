# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | 2.1.252 |
| Cursor | pending | 3.11 (+ changelog 2026-08-27) |
| Codex | pending | 0.151.0 |
| OpenCode | pending | pending |

All four adapter packages now ship a runnable `dist/cli.js`, so each client is
usable today. The Codex release this repo targets is **0.151.0** and the Cursor
release is **3.11** (changelog covered through 2026-08-27; desktop CLI observed at **3.18.9**): for each, the
compatibility delta was reviewed against the existing adapter and its registration
shape (`.codex/config.toml` for Codex, `.cursor/mcp.json` for Cursor), and nothing
in either requires a client change. That is a documentation review, not a host
test — `Validated against` stays `pending` for both, as it does for every platform,
because running the adapter end-to-end against a released host is a separate axis
that no target has cleared yet. The tracked pins live at the repo root:
[`.claude-code-version`](../../.claude-code-version),
[`.codex-version`](../../.codex-version), and
[`.cursor-version`](../../.cursor-version).

Codex 0.150.0 adds native task references, improved task naming/copy ergonomics, and an
`Interrupt` hook that can invoke commands or MCP handlers when a top-level turn is
interrupted. Codex 0.150.1 is a remote-compaction budgeting fix. Codex 0.151.0 adds a
configurable discovery grace for optional MCP servers, lets extensions inspect or replace
MCP tool results before they reach the model, improves per-repository plugin catalog
configuration and invalid-marketplace isolation, and further hardens restored permission
profiles and remote sandbox path semantics. None changes this adapter's `.codex/config.toml`
registration or MCP tool contract, so no compatibility migration is required here; the host
reliability fixes apply automatically.

Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol. Production Master's current
stdio server intentionally continues to advertise its older supported MCP
protocol; changing only the protocol string would be unsafe. A future SDK-backed
upgrade should adopt the newer protocol when paginated discovery, multi-round
requests, and non-blocking startup can be implemented and tested together.

**Claude Code notes (2.1.251 → 2.1.252).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged. 2.1.252's
published delta is four host-side fixes, none with a surface in this thin
client: a macOS Bash "task output swap refused" fix, a fix for "always
allow" not persisting in a project with no `.claude/settings.local.json`
yet (this repo's [`.claude/settings.json`](../../.claude/settings.json)
already checks in its allow/deny rules explicitly, so no interactive
"always allow" write is needed here), a Remote Control stall-after-tool
fix for Claude Desktop/VS Code hosts, and a fix for oversized background-task
failure output overflowing the request size limit (this repo defines no
hooks or background tasks under `.claude/` — constraint #4). Nothing to
adopt or change.

**Claude Code notes (2.1.247 → 2.1.251).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged across the
whole range. 2.1.250 shipped only "bug fixes and reliability improvements,"
with no further detail published — nothing to review there.

Reviewed and not applicable from 2.1.248: `--restricted` /
`CLAUDE_CODE_RESTRICTED` (every command in [`commands/`](../../commands/)
declares `allowed-tools: Bash` to exec the thin-client binary, so a
restricted session that strips command-execution tools couldn't run any of
them — this repo can't adopt it without dropping Bash entirely; see Future
opportunities below); `experimental.cacheTtl` agent frontmatter and
`self-hosted-runner --client-label` (no agents, no self-hosted runners — see
[constraints #4/#5](../../.claude/rules/constraints.md)); server-managed-
settings load diagnostics, the `/web-setup` GitHub-token-scope warning,
`/usage-credits` for AWS-Marketplace/self-serve Enterprise, and cross-session
messaging on Bedrock/Vertex/Foundry (host session/billing surface, no model
calls here); and every listed background-session, Remote Control, `claude
agents`, MCP-as-client, and terminal fix — all host session machinery this
repo's five Bash-only commands never exercise.

Reviewed and not applicable from 2.1.251: the new `PreModelSwitch`/
`PostModelSwitch` hooks and `SessionStart` staleness fields, foreground-
subagent Remote Control streaming, the `/usage` spend-limit bar and `/cost`
prompt-cache line, and `claude --help attach/logs/stop/respawn/rm` (no
hooks, no subagents, no model calls, no background-session management from
this repo's commands — constraint #4); `CLAUDE_CODE_SUBAGENT_MODEL`'s
changed precedence and the default-commit-trailer change for unrecognized
models (this repo's [`.claude/settings.json`](../../.claude/settings.json)
already pins `attribution.commit` explicitly, so neither change alters it);
and the `env` change dropping `CLAUDE_CONFIG_DIR`/`CLAUDE_CODE_TMPDIR`/
`TMPDIR` support from project settings (this repo's `.claude/settings.json`
sets no `env` block to begin with). Two 2.1.251 fixes are worth naming
individually because they're adjacent to, but distinct from, guidance
already in this repo's docs:

- **Plugin commands pointing outside the plugin directory are now
  rejected.** Every command in [`commands/`](../../commands/) already
  resolves its binary strictly inside the plugin root
  (`${CLAUDE_PLUGIN_ROOT}/packages/adapter-claude-code/dist/cli.js`, falling
  back to `${CLAUDE_PLUGIN_ROOT}/dist/cli.js` — never a path that escapes
  `CLAUDE_PLUGIN_ROOT`), so this hardening changes nothing here; confirmed
  by inspection of all five command files, not just by absence of an
  obvious hit.
- **File tools (Read/Write/Edit) no longer follow a symlink swapped in
  after the permission check, and Grep/Glob now apply `Read(...)` deny
  rules through a symlinked search path.** This is a different protection
  layer from the sandbox `denyRead`/`denyWrite`/masking entries this repo's
  docs already track for a `PM_ACCESS_TOKEN` credentials file
  ([Troubleshooting → Sandboxed
  commands](troubleshooting.md#sandboxed-commands-claude-code)) — those
  guard the *Bash tool's* sandbox, while this fix guards the *file tools'*
  own permission checks. This repo's
  [`.claude/settings.json`](../../.claude/settings.json) sets no
  `Read(...)`/`Grep(...)`/`Glob(...)` deny rules of its own, so nothing here
  changes, but a user layering file-tool-level `deny` rules on top of (or
  instead of) the sandbox entries now gets the same TOCTOU-symlink
  hardening the sandbox side already had.

Everything else in 2.1.248–2.1.251 — spend-limit and prompt-cache/usage UI,
self-hosted-runner and Remote Control changes, terminal/keyboard fixes,
managed-settings and gateway sign-in changes, and the VS Code Remote Control
footer pill — is host-side UI, billing, or session-management work with no
surface in this thin client.

**Claude Code notes (2.1.246 → 2.1.247).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged. One
2.1.247 fix touches guidance already in this repo's docs: the command
**sandbox no longer deletes a dotfile-managed symlink** it finds repointed
outside the writable area — it now just blocks the write, as it already
does for any other out-of-bounds path.
[Troubleshooting → Sandboxed commands](troubleshooting.md#sandboxed-commands-claude-code)
already covers protecting a `PM_ACCESS_TOKEN` credentials file with a
sandbox `deny`/`mask` entry; a common way to manage that same file is a
dotfile-manager symlink (chezmoi, GNU Stow, and similar tools all work this
way), and before 2.1.247 a sandboxed command that repointed such a symlink
outside its writable area could have the sandbox delete the symlink itself
rather than merely refuse the write — silently breaking the dotfile
manager's link, not just the sandboxed command. Update Claude Code; no
change to the deny/mask entries or how the credentials file is managed is
needed once the host stops deleting the link.

The rest of the delta is host-side UI, CLI, and reliability work with no
surface in this thin client: the new `SendFeedback` tool and
`feedbackDrafts` setting; the enhanced `spinnerTipsOverride` shape and the
Bash-permission-prompt auto-mode tip; `/claude-api cost-optimize` and the
`/claude-api` skill's Admin API coverage (constraint #4 — no model calls,
no Admin API usage here); arrow-key/history-search, kitty-protocol
Ctrl-shortcut, and split-escape mouse-report terminal fixes; the
`/terminal-setup` Zed-keymap-merge fix; the `/rename`, `/compact`, and
background-session-"opening" fixes; the sub-agent first-call-404 fallback
chain and the hook/background-agent "Prompt is too long" and memory-growth
fixes (this client defines no hooks under `.claude/` and its commands spawn
no subagents — constraint #4); the `/install-github-app` SSH messaging fix;
background-session shell-command logging; the version-less
marketplace-plugin-cache-directory fix (this plugin's
[`plugin.json`](../../.claude-plugin/plugin.json) carries an explicit
`version` and this repo defines no marketplace catalog of its own); Remote
Control working-tree-diff reporting; the self-hosted-runner status-reporting
fix (this repo's CI is GitHub-hosted `ubuntu-latest` only — [constraint
#5](../../.claude/rules/constraints.md)); the managed-gateway first-run and
organization-sign-in fixes (no managed gateway configured here); cloud
session permission-mode and container-restart fixes; the plugin-marketplace
hardening against control/invisible characters (no marketplace lives in
this repo); the Bedrock/Vertex/Foundry MCP-connection-failure notice (no
`.mcp.json` here — see the 2.1.229 note below); Sonnet 5's larger
auto-compact window, collapsed cross-session peer messages, plain-text
terminal hyperlink hardening, the PR-badge refocus-check skip, and the
Claude-apps gateway sign-in User-Agent change (host session/UI ergonomics,
no client surface).

**Claude Code notes (2.1.245 → 2.1.246).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged. One
2.1.246 fix touches guidance already in this repo's docs: the command
sandbox's **filesystem configuration now respects `--setting-sources`**.
[Troubleshooting → Sandboxed commands](troubleshooting.md#sandboxed-commands-claude-code)
already notes that the `mode: "mask"`/`extract`/`decode: "jwt"` credential-file
protections for a seeded `PM_ACCESS_TOKEN` are honored only from user,
managed, or `--settings` settings, not from a project's checked-in settings
— before 2.1.246, a session launched with `--setting-sources` narrowed to
exclude one of those sources could still pick up sandbox filesystem
`denyRead`/`denyWrite`/masking rules from a source it was told to exclude
(or fail to pick up rules from a source it was told to include), so the
effective protection on that credentials file didn't match what
`--setting-sources` asked for. Update Claude Code and keep the deny/mask
entries as written — no rewrite needed once the host respects the flag
correctly.

The rest of the delta is host-side UI, CLI, and reliability work with no
surface in this thin client: the `/permissions` Auto mode tab and turn-duration
line; fullscreen/transcript rendering and memory fixes; the 45-second
background-session-open fix; MCP-as-client fixes (interrupted-call reporting,
empty-schema argument typing, `requiresUserInteraction` tools) — this client's
Claude Code path registers via `/plugin install` and execs a binary from
`commands/`, so Claude Code is never this thin client's MCP client (see the
2.1.229 note below); the `←`/`/background` subagent-restart confirmation and
the subagent partial-result hint (no dynamic workflows or subagents here —
constraint #4); the plugin-cache duplicate-directory, `claude plugin update
<name>`, `plugin.json` BOM, and `/reload-plugins` skills-count fixes (this
plugin's `plugin.json` has no BOM and declares no `skills/` directory — the
[`run-production-master`](../../.claude/skills/run-production-master/SKILL.md)
skill is a project-local, contributor-facing skill under `.claude/skills/`,
not part of the published plugin bundle); the hook-error-message and
`keybindings.json` fixes (no hooks, no keybindings file here); the
Write-tool large-file-overwrite fix, the corrupted-`known_marketplaces.json`
install fix, and the resumed-session 400 fix for third-party API proxies
(no proxy in this client's path); the `Notification` hook timing fix (no
hooks); the malformed-Bash-command approval fix (this repo's
[`.claude/settings.json`](../../.claude/settings.json) allow rules end in a
trailing `*`, if at all, never a wildcard before a fixed subcommand token,
and none are malformed); `--strict-mcp-config` and telemetry-credential
scoping (no `.mcp.json` here, no third-party gateway configured by this
repo); the auto-continue for non-interactive/SDK/cloud sessions (this
repo's [`.github/workflows/claude.yml`](../../.github/workflows/claude.yml)
runs `anthropics/claude-code-action@v1`, which benefits automatically with
no workflow change); `/code-review` auto-start, the `/goal` check-in cap,
and the deferred managed-settings consent prompt (none of these commands
or settings are used here); and the improved `/cd` settings/hooks/skills
reload and Bash-tool latency (host session ergonomics, no client surface).

**Claude Code notes (2.1.241 → 2.1.245).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged.
2.1.245 shipped only a Linux-glibc-2.44 startup crash fix — a host binary
issue with no client-relevant surface. 2.1.244, 2.1.242, and 2.1.240
shipped no separately documented changes. Reviewed and not applicable from
2.1.243: the `/usage` Loops breakdown, `modelPicker`, `promptCacheTtl`/
`subagentPromptCacheTtl`, and `modelPricing` settings, and the model+effort
column added to `/tasks` (this client makes no model calls and spawns no
subagents — see [constraint #4](../../.claude/rules/constraints.md)); the
keyless Console sign-in, the `/web-setup` GitHub-connection tip and
`/status` line, and the `managed` marker for claude.ai-managed connectors
(this plugin is never installed as a claude.ai-synced or org-managed
connector — see the 2.1.239 `name@synced` note above); the workload-identity-
federation CI fix for `claude-code-action` (this repo's `.github/workflows/
claude.yml` authenticates with `anthropic_api_key: ${{ secrets.
ANTHROPIC_API_KEY }}`, not WIF — `id-token: write` is granted but unused by
that step); the hook `if`-condition command-substitution fix and the
`/reload-plugins` LSP-tool fix (this repo defines no hooks and no LSP
plugin); and the `--agents` JSON-validation fix (no command here launches
Claude Code with `--agents`). One item refines existing guidance rather than
requiring a change: 2.1.243 changed the sandboxed Bash tool's prompt to stop
listing allowed network hosts, so in the default (non-`strictAllowlist`)
sandbox mode Claude now attempts a request to `api.productionmaster.dev` and
lets you approve it, instead of assuming an unlisted host is blocked —
[Troubleshooting](troubleshooting.md#investigations-fail-with-connection-errors-only-inside-claude-code)
now notes this so the `strictAllowlist`-only guidance already there isn't
misread as covering every sandbox mode. Everything else in the 2.1.242–
2.1.245 range is host-side UI/perf/reliability work (auto mode, Remote
Control, `/resume`, cross-session messaging, VS Code) with no surface in
this thin client.

**Claude Code notes (2.1.238 → 2.1.241).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged.
2.1.240 and 2.1.241 shipped only "bug fixes and reliability improvements,"
with no further detail published — nothing to review there. Reviewed and
not applicable from 2.1.239: the **`/cost`/status-line/`--max-budget-usd`
1.1x US-only-inference premium** for data-residency workspaces and the
**Bedrock/Vertex/Foundry fullscreen-renderer offer** (this thin client
displays no cost estimate and is not itself a model-provider console —
see [constraint #4](../../.claude/rules/constraints.md)); **`/claude-api
upgrade`** for Python projects on `anthropic` 0.x→1.x (constraint #4 bars
any model-provider SDK import, so there is no `anthropic` dependency
anywhere in this repo — [`sdk/python`](../../sdk/python) talks to the
Production Master service over plain HTTP/SSE, not the Claude API); cloud
sessions showing claude.ai-synced plugins as **`name@synced`** (this
plugin installs via `/plugin install production-master@<marketplace>`
from a marketplace hosted elsewhere, or the SHA-256-pinned `archive`
source in [Quick Start](quick-start.md#claude-code) — never through a
claude.ai sync, so the name is always plain `production-master`, never
`production-master@synced`); the **Alpine/musl native-addon fix**
(clipboard, image-paste, audio-capture) — this CLI ships no native
add-ons of its own; and the usage-limit reset-time message wording.
Everything else in the 2.1.239–2.1.241 range is host-side UI/billing/
reliability work with no client-relevant surface.

**Claude Code notes (2.1.236 → 2.1.238).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged across
2.1.237 and 2.1.238. Reviewed and not applicable: 2.1.237's built-in
**"Concise" output style** (opt-in under `/config`) and its prompt-caching
fix for gateway/custom-base-URL sessions — this repo ships no output-style
file, and the client never calls a model directly (see [constraint
#4](../../.claude/rules/constraints.md)), so neither surface exists here.
2.1.238's plugin-marketplace **`headersHelper`** (mints auth headers for
catalog/archive fetches on install/update) is also not applicable: this
repo's Claude Code install path is `/plugin install` from a marketplace
hosted elsewhere, or the SHA-256-pinned `archive` source documented in
[Quick Start](quick-start.md#claude-code) — no marketplace or catalog entry
lives in this repo for a `headersHelper` to attach to. Also reviewed and not
applicable: the new `self-hosted-runner --defer-shutdown-max-min` /
`--proxy-authorization-command`/`--proxy-authorization-file` flags — this
repo's CI runs GitHub-hosted `ubuntu-latest` only, never `self-hosted` (see
[constraint #5](../../.claude/rules/constraints.md)); the subagent-tool-result
memory-growth fix and the custom/project/plugin output-style-drift fix — this
client's commands run no subagents and define no output style; and the fix
for stdio MCP servers receiving `server/discover` before `initialize` — this
client's Claude Code path registers via `/plugin install`, not MCP, so Claude
Code is never this thin client's MCP client (the `.cursor/mcp.json`/
`.codex/config.toml`/`opencode.json` registrations talk to Cursor/Codex/
OpenCode's own MCP clients, not Claude Code's). Everything else in the
2.1.237–2.1.238 range is host-side UI/perf/reliability work — Remote Control
and cross-session-messaging fixes, the `keybindingFlavor` readline setting,
permission-prompt and MCP-elicitation-dialog rendering, startup
responsiveness — with no client-relevant surface.

**Claude Code notes (2.1.234 → 2.1.236).** Registration, sandboxing
configuration shape, and command-argument handling are unchanged. The one
2.1.236 item that touches this client directly: **macOS sandbox wildcard
`denyRead` rules are now hardened** — they take precedence inside allowed
read regions, cover a matched directory's contents, and can no longer be
bypassed by renaming the denied file. This closes the same
sandboxed-file-protection bypass family as the Linux/macOS trailing-slash
`denyRead` fix in 2.1.224 and the Windows NT-namespace-path fix in 2.1.234
(see
[Troubleshooting → Sandboxed commands](troubleshooting.md#sandboxed-commands-claude-code)):
macOS users protecting a `PM_ACCESS_TOKEN` credentials file with a wildcard
sandbox deny entry now get the same guarantee Linux already had, and — since
credential masking falls back to plain `deny` on macOS anyway — this is now
the strongest protection macOS users have for that file. Everything else in
2.1.235 and 2.1.236 is host-side UI/perf/reliability work with no
client-relevant surface: the optional prompt `spellcheck` setting,
`/ultrareview`/`/autofix-pr` background memory/CPU improvements, permission-
dialog consistency and embedded-`grep` hardening, `SendMessage` size limits
and the new `notify_when_idle` option, the `ANTHROPIC_DEFAULT_MODEL`
environment variable, and auto-mode classifier parity on Bedrock/Vertex/
Foundry — none of it touches this client's registration, commands, or
manifests.

**Claude Code notes (2.1.233 → 2.1.234).** Registration, sandboxing, and
command argument handling are unchanged. This release's hardening against
Windows NT-namespace path reads closes another instance of the same
sandboxed-file-protection bypass family as the Linux/macOS trailing-slash
`denyRead` bypass fixed in 2.1.224 (see
[Troubleshooting → Sandboxed commands](troubleshooting.md#sandboxed-commands-claude-code)):
Windows users who protect a credentials file seeding `PM_ACCESS_TOKEN` with a
sandbox filesystem deny entry now get the same guarantee Linux/macOS already
had. The rest of the delta is host-side session/UI work with no client
change: auto-continue on usage-limit reset, GitLab MR badges in the
footer/statusline, account-email-only identification, Remote Control
cross-session/org-switch sync, `/permissions` and `/add-dir` usable while
Claude is working, `/goal` improvements, and transcript-rendering fixes —
none of it touches this client's registration, commands, or manifests.

**Claude Code notes (2.1.232 → 2.1.233).** Registration is unchanged. One
2.1.233 fix touches this client directly: **skill/command argument
substitution no longer re-expands argument values as template markers.**
Every command in `commands/` (`login.md`, `investigate.md`, `connect.md`,
`update.md`) interpolates `$ARGUMENTS` both in its prose and in the Bash
block that execs the CLI; before 2.1.233, an argument value that itself
looked like a template marker (for example an incident description or JSON
payload copied from another prompt) could be re-expanded a second time
instead of passed through literally. Fixed host-side — no command-file
change needed, but see
[Troubleshooting → Command arguments](troubleshooting.md#command-arguments-claude-code)
for the versions affected. Also relevant to this repo:
**`claude plugin validate` now checks a bare `.claude/skills` directory**
and reports any `SKILL.md` whose frontmatter fails to parse — a free extra
check on this repo's [`run-production-master`
skill](../../.claude/skills/run-production-master/SKILL.md), which already
parses cleanly. The rest of the delta is host-side and needs no client
change: GitLab merge-request URLs in `--worktree`/`claude agents`, the
`forward_user_identity` apps-gateway setting, opt-in Bash memory-cgroup
limits and the WebFetch cache-TTL env var, notification-hook and idle-CPU
fixes, the Windows NT-path and self-hosted-runner fixes, and the todo/task
tracking tools being off by default on newer models (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`
restores them) — this client's commands never invoke those tools.

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

**Cursor notes (3.11 → 2026-08-27).** Registration remains `.cursor/mcp.json` →
`mcpServers.production-master` (see [Quick Start](quick-start.md)). Cursor 3.9+'s
Customize page is the preferred place to manage that MCP entry alongside plugins,
skills, and hooks. Team admins on 3.10+ can also distribute an approved MCP via
**Team MCPs in team marketplaces** (Dashboard → Integrations & MCP) so members
install the same server without hand-editing JSON. Optional Google Workspace
marketplace plugins (2026-08-03) are unrelated to this thin client and are not
required for investigations. **Origin (2026-08-17, early beta):** Cursor's git
forge ([docs](https://cursor.com/docs/origin)) can host or **mirror this public
GitHub repo** for browse/PR review inside Cursor; use the [Origin CLI](https://cursor.com/docs/origin/cli) for clone/push/pull; agents can [create Origin repos](https://cursor.com/docs/origin/create-repository); connect [Automations / Cloud Agents](https://cursor.com/docs/origin/integrations) and apps (Vercel / Depot / Buildkite) from repo settings. GitHub remains the source of
truth for installs and CI (`ubuntu-latest` only — public repo). Do not treat
Origin-only hosting as a replacement for the GitHub remote users clone. **Cloud
Agent Builds (2026-08-13; default as of 2026-08-17):** when validating adapters
in Cloud Agents, Builds is now the default — confirm a recent successful Build,
`Update stale builds` on (Staleness threshold default 24h), and install
credentials as team/environment secrets. Sessions boot from a warm install
snapshot (~hourly refresh). Put durable deps in `install` and fresh services in
`start`; use **team/environment secrets** for private-registry install
credentials (user secrets are not available during Builds). Recurring Builds
**Skip** when nothing changed since the last completed Build (no new
default-branch commits / config / secret changes) — a Skipped stream is healthy.
Enable **Update stale builds** and set the **Staleness threshold** (default
**24 hours**; `0` = always pull latest default-branch at agent start). Phase
split: durable work in `install` (Build-time), fresh services in `start`, shared
app processes in `terminals` (both at agent start). Desktop download line
**3.18.9** (2026-08-30 stable download line; no separate feature write-up beyond date-only changelog through 2026-08-27).
([announcement](https://cursor.com/blog/builds) · [Builds docs](https://cursor.com/docs/cloud-agent/builds)).

**Cursor working tips.** **Start from scratch / Origin without SCM (2026-08-27):** Cloud Agents no longer need a connected GitHub (or other SCM) to begin — pick **Start from scratch**, prompt immediately, then **Create repo** to save into an Origin repo (private/internal). Live **browser port-forward preview** (incl. design mode) and optional **Vercel publish** for a live URL are available from the agent session. GitHub remains canonical for this public thin client's installs/CI. **Subscriptions / Custom Modes / isolated-VM subagents / `/goal` (+ CreateGoal/UpdateGoal) + steering (2026-08-19):** Cloud Agents can wake on PR/Slack/schedule and auto-subscribe to PRs they open; pin any skill as a Custom Mode via ⌥⏎ / Alt+Enter from `/`; cloud subagents can run on their own VMs; use `/goal` or native **CreateGoal** / **UpdateGoal**; follow-ups wait for the next tool call. Cursor CLI **Aug 11** adds sticky skills (Option+Enter),
steer-while-running (Enter queues guidance; Enter again interrupts), optional
durable `/goal` (gated), and runs hooks from installed plugins once a Cursor-native
hooks bundle exists — irrelevant to this thin-client adapter beyond local CLI
debugging.  Desktop CLI may report **3.16.29** while the public feature
changelog stays on **3.11** — this repo pins the feature/date in `.cursor-version`
and records `desktop_cli` separately. Newest covered changelog date is **2026-08-27** (subscriptions / custom modes / isolated subagent VMs / `/goal` / steering). Cursor also loads the open
[Agent Plugins](https://agent-plugins.org) standard alongside `.cursor-plugin`
manifests. The desktop/CLI `workspaceOpen` hook can return `pluginPaths` for
workspace-specific plugins (not available on Cloud Agents). Use a **side chat**
(`/side`, `/btw`, 3.11) to debug MCP registration or compare adapter shapes without
interrupting an in-flight investigation. **Cursor Automations** (3.8, `/automate`)
can **delete memory files** from the UI (or when prompted) and can watch **Workflow run completed** on this repo's CI and open a fix PR; enable
computer use when you want a demo artifact attached. Prefer **Balance** Auto /
Cursor Router mode for routine adapter work. **Grok 4.6 (2026-08-14):** prefer for long-running adapter validation and visual/interactive demos ([announcement](https://cursor.com/blog/grok-4-6)); Router Balance remains the default for routine work. **Inbox multi-PR sessions
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
