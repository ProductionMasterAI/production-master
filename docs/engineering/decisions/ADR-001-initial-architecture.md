# ADR-001: Thin client over hosted service

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

Production Master runs autonomous production-incident investigations. Users want to trigger and follow those investigations from where they already work — their editor — across Claude Code, Cursor, Codex, and OpenCode.

There are two broad ways to deliver that:

1. **Fat client** — put investigation logic, model access, and data-source credentials in the editor-side client.
2. **Thin client** — keep all of that on a hosted service, and make the editor-side client a transport-and-render layer.

This repository is public. Anything shipped here is world-readable and installed on end-user machines. That constraint, plus the goal of one consistent experience across four editors, drives the decision.

## Decision

**This repository is a thin client over the hosted service.** All investigation logic is server-side. The client's responsibilities are limited to:

- **Auth** — device-code login and token storage.
- **Transport** — exposing thin-client commands to the editor over MCP; calling the service over HTTPS.
- **Streaming** — consuming the service's SSE stream and rendering progress.
- **Render adapters** — per-editor presentation of a neutral event model.

The client contains **no** analysis logic, **no** model or provider SDKs, and **no** data-source credentials. This boundary is enforced in CI by an `ip-guard` job that fails the build if disallowed content is introduced.

## Consequences

### Positive

- **Small, safe public surface.** No proprietary logic or secrets ship in an open, installable client.
- **Consistent across editors.** One core; editors differ only by a thin render adapter. Adding an editor doesn't touch transport or auth.
- **Independent evolution.** The service can change how investigations run without shipping a client update, as long as the HTTPS/SSE contract holds.
- **Clear security story.** Credentials for doing the work never leave the service; the client only holds a user session token.

### Negative / trade-offs

- **Requires connectivity.** The client is useless offline — every run depends on the hosted service.
- **Contract coupling.** The client depends on the service's HTTPS + SSE contract; breaking changes there require coordinated releases.
- **Thin by enforcement.** Contributors may be tempted to add "just a little" logic client-side. The `ip-guard` CI job exists precisely to reject that and keep the boundary honest.

### Enforced constraints

- No model/provider SDK dependencies in any `packages/*` workspace.
- No investigation/analysis logic in this repo.
- The `ip-guard` CI job is a required check on every PR.
