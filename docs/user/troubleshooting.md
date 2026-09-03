# Troubleshooting

If something isn't working, find your symptom below. Most issues fall into one of four buckets: **auth**, **service URL**, **MCP registration**, or **sandboxed commands**.

## Auth failures

### The device code is rejected or expired

Device codes are short-lived. If you waited too long before approving in the browser, run `/login` again to get a fresh code, and approve it promptly.

### "Not authenticated" when starting a run

Your stored token is missing or expired. Re-run `/login`. If it keeps happening after a successful login, your editor may not be able to persist the token — check that the client has permission to write to its token store (OS keychain or config directory) and that a security tool isn't clearing it.

### Login succeeds but investigations return 401/403

The token is valid but your account may lack access to the service, or you approved the session against a different service URL than the one the client is calling. Confirm your account has access, then verify the [service URL](#service-url) matches.

## Service URL

By default the client talks to the standard hosted service. If your organization runs the service at a custom URL, point the client at it before logging in.

Set it via environment variable in your editor's client configuration (Cursor,
Codex, and OpenCode register the client as an MCP server pointing at your local
build — see [Quick Start](quick-start.md#1-install-the-client-in-your-editor)
for how to build it):

```jsonc
{
  "mcpServers": {
    "production-master": {
      "command": "node",
      "args": ["/absolute/path/to/production-master/packages/adapter-cursor/dist/cli.js", "mcp"],
      "env": {
        "PM_SERVICE_URL": "https://<your-service-host>"
      }
    }
  }
}
```

Then reload the editor and run `/login` again so the device-code session is created against the correct service.

Common mistakes:

- Trailing slash or a path segment on the URL — use the bare origin (`https://host`), no trailing `/`.
- `http://` instead of `https://` — the service requires TLS.
- Logging in *before* setting the URL — the token is bound to the service you authenticated against; set the URL first.

## Sandboxed commands (Claude Code)

### Investigations fail with connection errors only inside Claude Code

The slash commands run the thin client through the Bash tool, so they are subject
to Claude Code's command sandbox and its network egress rules. Since Claude Code
2.1.219, the `sandbox.network.strictAllowlist` setting makes sandboxed commands
**fail on non-allowlisted hosts without ever prompting** — so under a strict
allowlist the client can't reach the service and you see plain connection
errors/timeouts with no permission dialog. On Claude Code 2.1.224+ this is
easier to diagnose: sandbox violation details now appear in the Bash tool
result, so the denied host is named instead of surfacing as a bare connection
error — older versions show only the bare error.

Fix: add the service host to your sandbox network allowlist in Claude Code
settings — `api.productionmaster.dev` by default, or the host from your custom
`PM_SERVICE_URL` if your organization runs the service elsewhere. The device-code
login flow opens a browser out-of-band and is not affected; only the CLI's HTTPS
calls (trigger, stream, approve/reject) need the allowlist entry.

**This is specific to `sandbox.network.strictAllowlist`.** As of Claude Code
2.1.243, outside strict-allowlist mode the sandboxed Bash tool's prompt no
longer lists which hosts are allowed — Claude just attempts the request to
`api.productionmaster.dev` (or your custom `PM_SERVICE_URL` host) and you
approve or deny it, rather than the client assuming an unlisted host is
blocked. The hard, no-prompt failure described above only happens under
`strictAllowlist`; if you aren't using that setting and a call to the
service still silently fails, look at the approval prompt rather than
assuming the host needs allowlisting.

Related notes for recent Claude Code versions:

- **TLS errors on large sandboxed uploads are fixed in 2.1.221.** If attaching a
  large context bundle to a run failed with TLS errors through the sandbox proxy
  (rather than the connection errors above), update Claude Code before changing
  any allowlist settings — that failure mode was a sandbox-proxy bug, not a
  configuration problem.
- **Headless/CI token files can be masked instead of denied.** The client's
  interactive login stores tokens in the OS keychain, but headless setups that
  seed `PM_ACCESS_TOKEN` from a credentials file can use 2.1.221's
  `mode: "mask"` for sandbox credential files (Linux/WSL): sandboxed commands
  read a sentinel copy while the sandbox proxy substitutes the real value on
  egress, so the token never appears in command output or the transcript. On
  macOS, file masking falls back to `deny`. Claude Code 2.1.224 extends
  masking with options for structured values — `extract` (with
  `onExtractNoMatch`) for structured env values, and `decode: "jwt"` with
  `maskClaims` for JWT-aware masking, useful when the seeded credential is a
  JWT rather than an opaque token. These options need `network.tlsTerminate`
  and are honored only from user, managed, or `--settings` settings — not
  from a project's checked-in settings.
- **Headless sessions no longer lose their long-lived login to a transient 401
  (fixed in 2.1.225).** Before 2.1.225, a transient 401 during a headless run
  could replace a long-lived `CLAUDE_CODE_OAUTH_TOKEN` with a stored login's
  short-lived token, after which every request failed until the session was
  restarted. In a CI job that triggers investigations, this looked like the
  whole run's auth "going bad" mid-flight. Updating Claude Code rules this bug
  out, but **it does not rule out the Production Master credential**, which
  produces the same shape: a token supplied via `--token` / `PM_ACCESS_TOKEN` is
  seeded with no refresh token and a far-future local expiry, so the client never
  refreshes it and a genuinely expired or revoked token first surfaces as a
  service-side 401 part-way through the run. Distinguish by what fails: if
  non-Production-Master requests are also 401ing, it is the host bug (update); if
  only calls to the service fail, re-issue the token and re-seed it.
- **Trailing-slash sandbox deny entries were bypassable before 2.1.224.** If
  you protect the credentials file that seeds `PM_ACCESS_TOKEN` (or any other
  secret) with a sandbox filesystem deny entry written with a trailing slash
  (e.g. `denyRead: "~/.pm-credentials/"`), that entry was silently bypassable
  on Linux and macOS before 2.1.224. Update Claude Code and keep the deny
  entries as written — no rewrite of the entries is required.
- **macOS wildcard sandbox deny entries are hardened as of 2.1.236.** If you
  protect the directory holding your `PM_ACCESS_TOKEN` credentials file with a
  wildcard `denyRead` pattern on macOS (e.g. `~/.pm-credentials/**`), that
  pattern now takes precedence inside allowed read regions, covers the
  matched directory's contents, and can't be sidestepped by renaming the
  file — closing the last gap in the deny-entry hardening that started with
  the 2.1.224 trailing-slash fix above. Credential masking (`mode: "mask"`,
  see above) still falls back to plain `deny` on macOS, so a wildcard deny
  entry is currently the strongest protection macOS users have for that file;
  update Claude Code to get the fix.
- **Sandboxed commands failing to start at all on Linux are fixed in 2.1.223.**
  If every sandboxed command errored immediately (never reaching the network)
  and your sandbox settings have `sandbox.filesystem.denyWrite` covering the
  working directory, that was a Claude Code bug fixed in 2.1.223 — update
  rather than loosening the deny rule.
- **The sandbox filesystem config now respects `--setting-sources` as of
  2.1.246.** The `mode: "mask"` / `extract` / `decode: "jwt"` protections for
  a credentials file seeding `PM_ACCESS_TOKEN` (above) are honored only from
  user, managed, or `--settings` settings, never from a project's checked-in
  settings. Before 2.1.246, a session launched with `--setting-sources`
  narrowed to include or exclude one of those sources could still apply
  sandbox filesystem `denyRead`/`denyWrite`/masking rules from a source it
  was told to exclude, or fail to apply rules from a source it was told to
  include — so the effective protection on the credentials file could
  silently disagree with what `--setting-sources` asked for. If you launch
  Claude Code with `--setting-sources` and rely on it to control which
  source's sandbox filesystem rules apply, update to 2.1.246+; no rewrite of
  the deny/mask entries themselves is needed.
- **The sandbox no longer deletes dotfile-managed symlinks, as of 2.1.247.**
  If you manage your `PM_ACCESS_TOKEN` credentials file with a dotfile
  manager (chezmoi, GNU Stow, and similar tools all place a symlink at the
  real path and keep the actual file elsewhere), a sandboxed command that
  found that symlink repointed outside its writable area could, before
  2.1.247, have the sandbox delete the symlink itself instead of simply
  blocking the write — breaking the dotfile manager's link, not just the
  command that triggered it. Update to 2.1.247+; the credentials file's
  location, its symlink, and its existing `deny`/`mask` sandbox entry (above)
  need no change.
- **Unattended headless runs can deny instead of hang, as of 2.1.259.** The
  `PM_ACCESS_TOKEN`-seeded headless setups described above have no
  interactive session to answer a permission prompt. Before 2.1.259, if a
  headless run needed something outside
  [`.claude/settings.json`](../../.claude/settings.json)'s allow list, the
  run either stalled waiting on a prompt or had to launch with
  `--permission-mode bypassPermissions`, which also waives the sandbox and
  file-tool protections this section relies on for the credentials file. Add
  `--permission-prompts none` to a headless invocation of `/investigate`,
  `/connect`, or `/update` (a CI job or scheduled trigger) instead: the
  active permission mode still decides what the allow list auto-approves,
  but anything that would otherwise prompt is denied outright, so an
  unexpected prompt fails the run cleanly rather than hanging it.

## Command arguments (Claude Code)

### A description or payload with `$`-looking text behaves oddly

Every command in `commands/` (`/login`, `/investigate`, `/connect`, `/update`)
interpolates the argument text as `$ARGUMENTS` — both in the command's prose
and in the Bash block that execs the CLI (`node "$CLI" investigate --input
"$ARGUMENTS"`, and similarly for the others). Before Claude Code 2.1.233, an
argument value that itself contained something shaped like a template marker
— for instance an incident description pasted from another prompt, or a raw
JSON `update` payload with an unlucky substring — could be re-expanded a
second time instead of passed through as literal text, producing a mangled
CLI invocation. Fixed in 2.1.233: argument values are no longer re-expanded.
On older versions, if `/investigate` or `/update` behaves unexpectedly on a
particular input, try rephrasing the argument to avoid `$`-prefixed tokens or
update Claude Code.

## MCP registration issues

### The editor doesn't show the client's commands

The client didn't register. Check, in order:

1. **Config file location** — the manifest must be where the editor looks: `.cursor/mcp.json` (Cursor), `.codex/config.toml` (Codex), `opencode.json` (OpenCode). Claude Code registers via `/plugin install`, not a file.
2. **Valid syntax** — a JSON/TOML syntax error silently drops the entry. Validate the file.
3. **Reload** — most editors read MCP config at startup; fully reload or restart after editing. (Claude Code 2.1.221+ activates plugins installed with `/plugin install` immediately when safe — no reload step.)
4. **`npx` reachable** — the client launches via `npx`; make sure Node.js 22 is installed and `npx` is on `PATH`.

Two related Claude Code notes:

- **Plugin installed in more than one project?** Before 2.1.224, installing the
  same plugin in multiple projects could silently corrupt its install records.
  If this client's slash commands disappeared after you installed the plugin in
  a second project, update to Claude Code 2.1.224+ and reinstall once — the fix
  stops the corruption at the source.
- **MCP tools connecting mid-turn.** If you register the client as an MCP
  server in Claude Code (rather than via `/plugin install`) and it connects
  mid-conversation, versions before 2.1.224 could defer its tools for tool
  search without announcing their names — the agent wouldn't see or use the
  tools for the rest of that turn. Fixed in 2.1.224; on older versions, sending
  the next message makes the tools visible.
- **Marketplace vanished, or a just-published version won't install.** Before
  2.1.232, a startup race between concurrent `known_marketplaces.json` writes
  could silently unregister a plugin marketplace — re-add it with
  `/plugin marketplace add`. And since 2.1.232,
  `/plugin install production-master@<marketplace>` refreshes the marketplace
  first, so a freshly published plugin version installs without a manual
  `/plugin marketplace update` (2.1.221–2.1.231 refresh a stale catalog and
  retry only after a failed lookup).

### The client registers but fails to start

Look at your editor's MCP/extension logs for the `production-master` entry. A non-zero exit usually means Node.js is the wrong version (needs 22) or the package couldn't be fetched — check network access to the npm registry.

### Streaming stalls or disconnects

Live progress uses SSE over HTTPS. A proxy or firewall that buffers or drops long-lived connections can stall the stream. Reconnect with `/connect <run-id>`; if it still stalls, check whether an outbound proxy is interfering with SSE.

## Still stuck?

Open a GitHub issue with your editor and version, the client version, and the redacted output or log excerpt. Never include tokens or service credentials.
