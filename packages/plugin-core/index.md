# @production-master/plugin-core — host-neutral thin-client core

`packages/plugin-core` is the host-neutral core shared by every per-IDE adapter
(`packages/adapter-*`). It renders investigation state, streams live progress,
and triggers/relays actions against the **hosted service** over its public
HTTP + SSE API.

It imports **no** LLM/provider SDK and runs **no** local investigation pipeline.
That boundary is grep-enforced in CI by the **ip-guard** job's no-provider-SDK
check. Adapters import the core; the core never imports an adapter.

## Composition root

`src/runtime/create-plugin-runtime.ts` exposes `createPluginRuntime()` — the
single entry point every host wires its sinks into. It assembles device-code
auth, the token store, the MCP session + tool surface, the HTTP/SSE transports,
and the streaming runner, then exposes the thin-client commands:

| Command | What it does |
|---------|--------------|
| `login()` | Device-code (RFC 8628) OAuth against the service; persists the session to the OS keychain |
| `investigate({ ticket })` | Creates a run on the service, then streams it to a terminal state |
| `connect(id)` | Re-attaches to an existing run (durable replay + live stream) |
| `update(id, tool, args)` | Forwards one scoped MCP tool invocation to the service |
| `logout()` | Clears the stored session |

There is exactly **one** runtime path — no local/inline mode.

## Streaming engine

`src/runner/remote-runner.ts` (`RemoteServiceRunner`) is the shared streaming
engine behind every command: create/attach a run, open the SSE `EventStream`
(with durable replay on reconnect), fold events into projections
(`src/projections/`), and render via the host's `HostAdapter` until a terminal
`investigation.completed` / `investigation.failed` event.

## Module map

| Path | Responsibility |
|------|----------------|
| `src/service/` | Typed `ServiceClient` over the hosted service's public API, plus Node HTTP transport |
| `src/auth/` | Device-code flow, token store, OS keychain backend |
| `src/mcp/` | MCP session scoping + tool surface over the service's Streamable-HTTP gateway |
| `src/stream/` | SSE `EventStream` and the Node SSE connector |
| `src/projections/` | Fold of the event stream into `ProjectionState` → `PanelView` |
| `src/render/` | Host-neutral render commands (statusline, pipeline, log-tail, actions) |
| `src/host/` | The `HostAdapter` port each per-IDE adapter implements |
| `src/context/` | Opt-in, redacted local-context collection |
| `src/trust/` | Session trust grants + mutation classification |
| `src/contract/` | Canonical agent-role taxonomy (schema parity with the service) |

## Entry point

`src/index.ts` re-exports the public API. Adapters import from
`@production-master/plugin-core`; test fixtures import from
`@production-master/plugin-core/testing`.
