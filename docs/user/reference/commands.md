# Command reference

The thin-client commands exposed to Cursor, Codex, OpenCode and `pmctl`. Exact invocation syntax varies slightly per IDE (slash command, tool call, or palette action), but the names and behavior are the same across those clients.

> **Claude Code uses an access token, not a device-code login, and its commands differ.** The Claude Code plugin has no `/login` or `/logout`: it asks for a Production Master access token when you install or enable it, and `/production-master:setup` walks you through creating, changing or removing it. Its commands are namespaced — `/production-master:investigate`, `/production-master:connect`, `/production-master:update` and `/production-master:setup` — and call the plugin's remote MCP server. `/production-master:update` relays requests such as listing an investigation's proposed actions or adding evidence; approving or rejecting an action is not one of the server's tools, so you approve or reject it on the investigation's page in the Production Master console. The table and notes below apply to the other clients; for Claude Code see [Troubleshooting: the plugin's access token](../troubleshooting.md#claude-code-the-plugins-access-token).

| Command | Arguments | What it does |
|---------|-----------|--------------|
| `/login` | _(none)_ | Starts the device-code login flow against the hosted service. Displays a code and URL to approve in your browser, then stores the session token. |
| `/investigate` | `"<incident description>"` | Starts a new investigation on the hosted service and begins streaming progress into the editor. Returns a run ID. |
| `/connect` | `<run-id>` | Re-attaches to an existing run and resumes live streaming of its progress and report. |
| `/update` | `approve <action-id>` \| `reject <action-id> ["<note>"]` | Relays your decision on a proposed action back to the service. `approve` lets it proceed; `reject` stops it, with an optional note. |

## Notes

- **`/login`** must succeed before any other command (in Cursor, Codex, OpenCode and `pmctl`; Claude Code uses its access token instead). If a call returns "not authenticated," run `/login` again. To target a custom service, set the service URL first — see [Troubleshooting](../troubleshooting.md#service-url).
- **`/investigate`** — give it a time window, the affected surface, and a symptom for the best starting point. See [Usage](../usage.md#start-an-investigation).
- **`/connect`** — reconnecting is read-only until the run reaches a decision point assigned to you.
- **`/update`** — every mutating action the investigation proposes is gated; there is no auto-apply. You'll be prompted per action. See [Usage](../usage.md#approve-or-reject-a-proposed-action).

## Scope

These commands cover the full thin-client surface: authenticate, start, follow, and decide. Anything beyond that — how the investigation reasons, what data it reads — happens on the hosted service and is not controlled from the client.
