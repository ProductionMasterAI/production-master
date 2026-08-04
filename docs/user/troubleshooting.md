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

Set it via environment variable in your editor's client configuration:

```jsonc
{
  "mcpServers": {
    "production-master": {
      "command": "npx",
      "args": ["-y", "@production-master/client"],
      "env": {
        "PRODUCTION_MASTER_SERVICE_URL": "https://<your-service-host>"
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
errors/timeouts with no permission dialog.

Fix: add the service host to your sandbox network allowlist in Claude Code
settings — `api.productionmaster.ai` by default, or the host from your custom
`PM_SERVICE_URL` if your organization runs the service elsewhere. The device-code
login flow opens a browser out-of-band and is not affected; only the CLI's HTTPS
calls (trigger, stream, approve/reject) need the allowlist entry.

Two related notes for Claude Code 2.1.221+:

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
  macOS, file masking falls back to `deny`.

## MCP registration issues

### The editor doesn't show the client's commands

The client didn't register. Check, in order:

1. **Config file location** — the manifest must be where the editor looks: `.cursor/mcp.json` (Cursor), `.codex/config.toml` (Codex), `opencode.json` (OpenCode). Claude Code registers via `/plugin install`, not a file.
2. **Valid syntax** — a JSON/TOML syntax error silently drops the entry. Validate the file.
3. **Reload** — most editors read MCP config at startup; fully reload or restart after editing. (Claude Code 2.1.221+ activates plugins installed with `/plugin install` immediately when safe — no reload step.)
4. **`npx` reachable** — the client launches via `npx`; make sure Node.js 22 is installed and `npx` is on `PATH`.

### The client registers but fails to start

Look at your editor's MCP/extension logs for the `production-master` entry. A non-zero exit usually means Node.js is the wrong version (needs 22) or the package couldn't be fetched — check network access to the npm registry.

### Streaming stalls or disconnects

Live progress uses SSE over HTTPS. A proxy or firewall that buffers or drops long-lived connections can stall the stream. Reconnect with `/connect <run-id>`; if it still stalls, check whether an outbound proxy is interfering with SSE.

## Still stuck?

Open a GitHub issue with your editor and version, the client version, and the redacted output or log excerpt. Never include tokens or service credentials.
