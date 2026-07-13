# Platform targets

One-sentence purpose: the editor/agent platform versions this client is validated against.

Machine-readable source of truth: [`platform-targets.json`](platform-targets.json).
The README badge row must match `validated_against` for each target.

| Platform | Validated against | Latest known |
|---|---|---|
| Claude Code | pending | pending |
| Cursor | pending | pending |
| Codex | pending | pending |
| OpenCode | pending | pending |

All targets are `pending` because the client packages have not landed yet — the repo is
scaffold-only. When the first adapter for a platform ships, set `validated_against` to
the platform version it was tested on, update `latest_known`, refresh `last_reviewed`,
and sync the README badges in the same PR.
