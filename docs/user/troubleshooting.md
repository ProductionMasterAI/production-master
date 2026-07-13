# Troubleshooting

If something isn't working, find your symptom below. Most issues fall into one of three buckets: **auth**, **service URL**, or **MCP registration**.

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

## MCP registration issues

### The editor doesn't show the client's commands

The client didn't register. Check, in order:

1. **Config file location** — the manifest must be where the editor looks: `.cursor/mcp.json` (Cursor), `.codex/config.toml` (Codex), `opencode.json` (OpenCode). Claude Code registers via `/plugin install`, not a file.
2. **Valid syntax** — a JSON/TOML syntax error silently drops the entry. Validate the file.
3. **Reload** — most editors read MCP config at startup; fully reload or restart after editing.
4. **`npx` reachable** — the client launches via `npx`; make sure Node.js 22 is installed and `npx` is on `PATH`.

### The client registers but fails to start

Look at your editor's MCP/extension logs for the `production-master` entry. A non-zero exit usually means Node.js is the wrong version (needs 22) or the package couldn't be fetched — check network access to the npm registry.

### Streaming stalls or disconnects

Live progress uses SSE over HTTPS. A proxy or firewall that buffers or drops long-lived connections can stall the stream. Reconnect with `/connect <run-id>`; if it still stalls, check whether an outbound proxy is interfering with SSE.

## Still stuck?

Open a GitHub issue with your editor and version, the client version, and the redacted output or log excerpt. Never include tokens or service credentials.
