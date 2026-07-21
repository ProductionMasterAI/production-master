# Contributing

Thanks for your interest in improving **production-master**. This is the thin client for the Production Master hosted service — contributions here touch auth, transport, streaming, and per-IDE rendering, never investigation logic (that runs in the hosted service).

## Contribution scope

Keep changes on the thin-client side. To keep the repo publish-safe and host-neutral:

- The plugin is a **thin client** — investigation logic runs in the hosted service, not here.
- PRs adding provider/model SDKs, pipeline or agent logic, or secrets will be declined.
- The core stays host-neutral — host-specific behavior lives in the per-IDE adapter packages.
- CI runs on GitHub-hosted runners only.
- CI's `ip-guard` and secret-scan jobs enforce these and will fail the build on a violation.

## Ground rules

- **One concern per PR**: small, reviewable changes merge fastest.
- **Green CI required**: every check must pass before merge, including lint, typecheck, tests, the [coverage gate](#test-coverage-gate), secret-scan, and `ip-guard`.

## Development setup

**Prerequisites:** Node.js 22 (pinned in [`.nvmrc`](../.nvmrc)), npm (ships with Node; the repo uses npm workspaces under `packages/*`), git, and a GitHub account.

```bash
# clone your fork
git clone https://github.com/<your-username>/production-master.git
cd production-master

nvm use          # pin the Node version from .nvmrc (Node 22)
npm ci           # clean, lockfile-faithful install

npm run build    # build all workspaces
npm test         # run the test suite
npm run lint     # lint (CI runs with max-warnings 0)
```

Run all three checks before opening a PR — CI runs the same set plus `ip-guard`, and fails on any lint warning.

### Test coverage gate

Tests run under [vitest](https://vitest.dev) v8 coverage, and CI **fails on a coverage regression**:

```bash
npm run test:coverage   # runs the suite and enforces the thresholds
```

The policy is a **rise-only ratchet**. Thresholds in [`vitest.config.ts`](../vitest.config.ts) are set a few points below the current measured coverage — high enough to catch regressions and coverage erosion (the thin per-IDE adapters are the main watch area), low enough that no large backfill is needed. Rules:

- **Never lower a threshold** to make a red build pass — add or fix tests instead.
- **When coverage climbs, raise the floors** so the gate keeps ratcheting upward.
- The denominator counts all workspace source under `packages/*/src`. Excluded: test files, `__fixtures__/`, package entry barrels (`index.ts`), and type-only modules (`types.ts`, the host-adapter seam) — none carry executable logic to cover.

Coverage reports (text summary in the console; HTML + `lcov` under `coverage/`, which is git-ignored) are produced on every `test:coverage` run.

**Versioning:** the project follows SemVer; record every user-facing change in [CHANGELOG.md](../CHANGELOG.md) under `## [Unreleased]` as part of your PR.

## Workflow

1. **Fork** the repository to your own account.
2. **Branch** from `main` using a descriptive prefix:
   - `feat/<short-description>` for new functionality
   - `fix/<short-description>` for bug fixes
   - `docs/<short-description>` for documentation-only changes
   - `chore/<short-description>` for tooling and housekeeping
3. **Develop** — see the development setup above.
4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) (see below).
5. **Open a PR** against `main`, fill in the description, and wait for CI.

## Commit convention

Format:

```
<type>(<scope>): <short summary>

[optional body explaining what and why]

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Example:

```
feat(auth): persist device-code token across sessions

Store the token in the OS keychain so users don't re-authenticate
on every editor restart.

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Pull request process

1. Ensure the branch is up to date with `main`.
2. Confirm locally that `npm run build`, `npm run lint`, and `npm test` all pass.
3. Open the PR with a clear title (Conventional Commit style) and a description of what changed and why.
4. Update [CHANGELOG.md](../CHANGELOG.md) under `## [Unreleased]` for any user-facing change.
5. Address review feedback; keep the branch green.
6. A maintainer merges once all checks — including `ip-guard` — pass and the review is approved.

## Reporting issues

Open a GitHub issue with steps to reproduce, your editor and version, the client version, and any relevant (redacted) output. Never paste secrets, tokens, or service credentials into an issue.
