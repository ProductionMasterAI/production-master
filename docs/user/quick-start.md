# Quick Start

Get from zero to your first investigation in a few minutes. Three steps, same everywhere: **install → log in → investigate.**

> **Prerequisites:** Node.js 22 and an account on the Production Master hosted service.

> **Status:** client packages are being populated via PRs. The manifest for your editor lands with those PRs; the registration pattern below is stable.

## 1. Install the client in your editor

Pick your editor. Each registers the same thin client through its native mechanism.

### Claude Code

```
/plugin install production-master
```

### Cursor

Add to `.cursor/mcp.json` in your project (or your global Cursor config):

```jsonc
{
  "mcpServers": {
    "production-master": {
      "command": "npx",
      "args": ["-y", "@production-master/client"]
    }
  }
}
```

### Codex

Add to `.codex/config.toml`:

```toml
[mcp_servers.production-master]
command = "npx"
args = ["-y", "@production-master/client"]
```

### OpenCode

Add to `opencode.json`:

```jsonc
{
  "mcp": {
    "production-master": {
      "command": ["npx", "-y", "@production-master/client"]
    }
  }
}
```

Reload your editor so it picks up the new client.

## 2. Log in

Run the login command in your editor:

```
/login
```

The client starts a **device-code** flow: it shows a short code and a URL. Open the URL in your browser, enter the code, and approve the session. Once approved, the client stores your token and you won't need to log in again until it expires.

If your organization runs the service at a custom URL, set it before logging in — see [Troubleshooting → Service URL](troubleshooting.md#service-url).

## 3. Run your first investigation

Start an investigation by describing the incident:

```
/investigate "checkout latency spiked at 14:20 UTC"
```

The client hands this to the hosted service and begins streaming progress back into your editor: status updates, findings, and finally the report. You don't have to wait at the terminal — you can reconnect to a run later (see [Usage](usage.md)).

When the investigation proposes an action that would change a system, the client pauses and shows it to you. **Nothing runs until you approve it.** Approve or reject inline.

## Next steps

- [Usage](usage.md) — start, reconnect, and approve/reject workflows in depth
- [Commands](reference/commands.md) — the full thin-client command list
- [Troubleshooting](troubleshooting.md) — if login or registration doesn't work
