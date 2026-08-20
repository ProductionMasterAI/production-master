# Platform support

The editor and agent platforms this client is validated against.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | 2.1.238 |
| Cursor | pending | 3.11 (+ changelog 2026-08-19) |
| Codex | pending | 0.148.0 |
| OpenCode | pending | pending |

All four adapter packages now ship a runnable `dist/cli.js`, so each client is
usable today. The Codex release this repo targets is **0.148.0** and the Cursor
release is **3.11** (changelog covered through 2026-08-19; desktop CLI observed at **3.16.29**): for each, the
compatibility delta was reviewed against the existing adapter and its registration
shape (`.codex/config.toml` for Codex, `.cursor/mcp.json` for Cursor), and nothing
in either requires a client change. That is a documentation review, not a host
test — `Validated against` stays `pending` for both, as it does for every platform,
because running the adapter end-to-end against a released host is a separate axis
that no target has cleared yet. The tracked pins live at the repo root:
[`.claude-code-version`](../../.claude-code-version),
[`.codex-version`](../../.codex-version), and
[`.cursor-version`](../../.cursor-version).

Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol. Production Master's current
stdio server intentionally continues to advertise its older supported MCP
protocol; changing only the protocol string would be unsafe. A future SDK-backed
upgrade should adopt the newer protocol when paginated discovery, multi-round
requests, and non-blocking startup can be implemented and tested together.

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

**Cursor notes (3.11 → 2026-08-19).** Registration remains `.cursor/mcp.json` →
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
**3.16.29** (2026-08-18; no separate feature write-up).
([announcement](https://cursor.com/blog/builds) · [Builds docs](https://cursor.com/docs/cloud-agent/builds)).

**Cursor working tips.** **Subscriptions / Custom Modes / isolated-VM subagents / `/goal` + steering (2026-08-19):** Cloud Agents can wake on PR/Slack/schedule and auto-subscribe to PRs they open; pin any skill as a Custom Mode via ⌥⏎ / Alt+Enter from `/`; cloud subagents can run on their own VMs; follow-ups wait for the next tool call. Cursor CLI **Aug 11** adds sticky skills (Option+Enter),
steer-while-running (Enter queues guidance; Enter again interrupts), optional
durable `/goal` (gated), and runs hooks from installed plugins once a Cursor-native
hooks bundle exists — irrelevant to this thin-client adapter beyond local CLI
debugging.  Desktop CLI may report **3.16.29** while the public feature
changelog stays on **3.11** — this repo pins the feature/date in `.cursor-version`
and records `desktop_cli` separately. Newest covered changelog date is **2026-08-19** (subscriptions / custom modes / isolated subagent VMs / `/goal` / steering). Cursor also loads the open
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
