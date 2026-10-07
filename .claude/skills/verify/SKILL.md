---
name: verify
description: Build, test, and lint this npm-workspaces monorepo. Claude Code 2.1.286+ runs this automatically right before each commit (except docs-only and tests-only commits); invoke it directly any time to check a change before that.
user-invocable: true
---

# verify

The fast local gate Claude Code runs automatically right before each commit, as of
2.1.286's `verify`-named-skill commit guidance (docs-only and tests-only commits skip
it). For the full pre-PR gate — a clean install and install-manifest validation on top
of these three — run
[`run-production-master`](../run-production-master/SKILL.md) instead.

## Steps

1. **Build all workspaces** — compile every package under `packages/*`:

   ```bash
   npm run build --workspaces --if-present
   ```

2. **Test** — run the full test suite across workspaces:

   ```bash
   npm run test --workspaces --if-present
   ```

3. **Lint** — the same lint gate CI enforces (warnings fail the build):

   ```bash
   npm run lint --workspaces --if-present
   ```

## Reporting

- Report each step as pass/fail with the command that proved it.
- On failure, show the failing output (trimmed) and stop — do not continue to later
  steps.
