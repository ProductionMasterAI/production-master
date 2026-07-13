---
name: run-production-master
description: Build all workspaces, run tests, lint, and validate the install manifests for the production-master thin-client monorepo. Use before opening a PR or when verifying a local checkout is healthy. Triggers on "build and test", "run the checks", "validate manifests", "verify the repo".
user-invocable: true
---

# run-production-master

End-to-end local verification for this npm-workspaces monorepo. Run every gate the way
CI does, in order, and stop at the first failure.

## Steps

1. **Install** — clean, reproducible install from the lockfile:

   ```bash
   npm ci
   ```

2. **Build all workspaces** — compile every package under `packages/*`:

   ```bash
   npm run build --workspaces --if-present
   ```

3. **Test** — run the full test suite across workspaces:

   ```bash
   npm run test --workspaces --if-present
   ```

4. **Lint** — the same lint gate CI enforces (warnings fail the build):

   ```bash
   npm run lint --workspaces --if-present
   ```

5. **Validate install manifests** — confirm each adapter package ships a well-formed,
   parseable install manifest before it can be published:

   ```bash
   node scripts/validate-manifests.mjs
   ```

   This checks every `packages/*/manifest.json` (or the repo's manifest convention)
   parses as JSON and carries the required fields. If the script is absent, fall back
   to a JSON parse sweep:

   ```bash
   find packages -name 'manifest.json' -exec node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' {} \;
   ```

## Reporting

- Report each step as pass/fail with the command that proved it.
- On failure, show the failing output (trimmed) and stop — do not continue to later
  steps.
- Only report the repo as healthy when steps 1–5 all pass; cite the final command's
  output as evidence.
