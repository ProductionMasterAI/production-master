# Usage

Common workflows once the client is installed and you're logged in. For first-time setup, see [Quick Start](quick-start.md); for the full command list, see [Commands](reference/commands.md).

## Start an investigation

Describe the incident and start a run:

```
/investigate "orders API returning 500s since the 15:10 deploy"
```

The client sends the request to the hosted service, which starts the investigation and returns a **run ID**. Progress then streams back into your editor over SSE — status, intermediate findings, and the final report — as the service produces it.

Tips for a good starting prompt:

- Include a **time window** ("since 15:10 UTC", "over the last hour").
- Name the **affected surface** ("checkout service", "orders API", "the payments worker").
- Add a **symptom** ("500s", "latency spike", "elevated error rate").

You keep working while it runs; the stream updates in place.

## Connect to an existing run

If you closed the editor, switched machines, or want to follow a run a teammate started, reconnect by run ID:

```
/connect <run-id>
```

The client re-attaches to the hosted service's stream for that run and resumes rendering live progress from the current point. Reconnecting is read-only until the run reaches a decision point that's assigned to you.

## Approve or reject a proposed action

When the investigation wants to take an action that changes a system — restarting a service, rolling back a deploy, scaling a resource — it does **not** act on its own. The client surfaces the proposed action with its details and rationale, and pauses.

Review it, then decide:

```
/update approve <action-id>
```

or

```
/update reject <action-id> "rolling back manually instead"
```

- **Approve** tells the service to proceed with that action.
- **Reject** tells it not to; an optional note is relayed back so the investigation can adapt.

Every mutating action is gated this way — there is no auto-apply. If a run has several proposed actions, you'll be prompted for each.

## Review the report

When the investigation finishes, the client renders the final report inline — summary, findings, and any recommended follow-ups. The full report also remains available on the hosted service; reconnect with `/connect <run-id>` at any time to view it again.

## Typical end-to-end flow

1. `/investigate "..."` — start the run, note the run ID.
2. Watch the stream; findings appear as they land.
3. `/update approve <action-id>` / `/update reject <action-id>` for each gated action.
4. Read the final report in your editor.
5. Later: `/connect <run-id>` to revisit.
