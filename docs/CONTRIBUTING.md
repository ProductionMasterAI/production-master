# Contributing

Thanks for your interest in improving **production-master**. This is the thin client for the Production Master hosted service — contributions here touch auth, transport, streaming, and per-IDE rendering, never investigation logic (that lives on the service).

## Ground rules

- **Scope**: keep changes on the thin-client side. No model/provider SDKs, no analysis logic, no service-side behavior — CI's `ip-guard` job enforces this and will fail the build if disallowed content lands.
- **One concern per PR**: small, reviewable changes merge fastest.
- **Green CI required**: every check must pass before merge, including lint, typecheck, tests, and `ip-guard`.

## Workflow

1. **Fork** the repository to your own account.
2. **Branch** from `main` using a descriptive prefix:
   - `feat/<short-description>` for new functionality
   - `fix/<short-description>` for bug fixes
   - `docs/<short-description>` for documentation-only changes
   - `chore/<short-description>` for tooling and housekeeping
3. **Develop** — see [getting started](engineering/guides/getting-started.md) for setup (`nvm use`, `npm ci`, `npm run build`, `npm test`).
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
