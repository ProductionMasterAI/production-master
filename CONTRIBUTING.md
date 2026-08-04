# Contributing

Thanks for your interest in Production Master. This repository is the **thin
client** — it registers with your editor, handles device-code login, starts a
run on the hosted service, streams progress back, and relays your approve/reject
decisions.

## What belongs here (and what doesn't)

The investigation itself runs entirely on the hosted service. Please don't open
pull requests that add analysis logic, prompts, model-provider SDKs, or
credentials for the analysis to this repository — they belong upstream, and CI
will reject them (see [CI](#ci) below). If you've found a problem with how an
investigation *behaves*, open an issue describing it rather than a PR against
this client.

Changes that fit well here:

- **Editor adapters** — a new adapter under `packages/`, or fixes to the
  existing Claude Code, Cursor, Codex, and OpenCode ones.
- **Client-side UX** — how runs are rendered, streamed, and surfaced for
  approval.
- **Docs** — anything in `docs/user/`, the README, or the troubleshooting guide.
- **Bug fixes** in login, streaming, or command wiring.

## Before you start

- **Bugs and features:** open an issue first for anything non-trivial, so we can
  agree on the approach before you spend time on it. Small fixes and doc
  corrections can go straight to a PR.
- **Security vulnerabilities:** do **not** open a public issue. Follow
  [SECURITY.md](SECURITY.md) and report privately.
- **Conduct:** participation is governed by our
  [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

You need **Node.js 22** (pinned in [`.nvmrc`](.nvmrc)).

```bash
nvm use
make install      # clean, lockfile-driven install
make build        # compile the host-neutral core and every adapter
```

`make help` lists every target. The `make` targets are thin wrappers — `make
test` runs `npm test` (vitest), and the workspace-wide variants are available as
`npm run test:workspaces` and `npm run lint`.

## Before you push

Run the same gates CI runs:

```bash
make lint
make test
make build
```

All three must pass. If you changed behavior, add or update a test — a PR that
changes what the client does without touching `tests/` will get that question in
review.

## CI

Every pull request runs three required jobs:

| Job | What it checks |
|---|---|
| `CI` | build, lint, and the test suite |
| `secret-scan` | no credentials or tokens committed |
| `ip-guard` | no server-side implementation detail in this public client repo |

`ip-guard` is the automated form of the boundary described above. If it fails on
your change, the fix is almost never to reword the flagged text — it's that the
change belongs on the service side rather than in this repository.

## Pull requests

- **Keep them focused.** One concern per PR; it makes review and revert both
  cheaper.
- **Update the docs** when you change behavior a user can observe.
- **Add a CHANGELOG entry.** This project follows
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
  [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — put user-facing
  changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md). Purely
  internal refactors don't need one.
- **Explain the why.** The diff shows what changed; the description should say
  what problem it solves.

Maintainers review and merge. Expect a round of questions — that's normal, not a
verdict on the change.

## Licensing

This project is [MIT licensed](LICENSE). By contributing, you agree that your
contributions are licensed under the same terms.
