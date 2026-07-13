# Getting started (development)

Set up the repo to contribute to the thin client. For contribution rules and the PR process, see [CONTRIBUTING](../../CONTRIBUTING.md).

## Prerequisites

- **Node.js 22** — the repo pins the version in `.nvmrc`.
- **npm** (ships with Node) — the repo uses npm workspaces (`packages/*`).
- **git** and a GitHub account (fork-based workflow).

## Setup

```bash
# clone your fork
git clone https://github.com/<your-username>/production-master.git
cd production-master

# use the pinned Node version
nvm use          # reads .nvmrc (Node 22)

# install workspace dependencies
npm ci
```

> **Note:** `packages/*` are being populated via PRs. Until a package lands, `npm ci` sets up the workspace root and tooling; build/test targets operate on whatever packages exist.

## Everyday commands

```bash
npm run build     # build all workspaces
npm test          # run the test suite
npm run lint      # lint (CI runs with max-warnings 0)
```

Run all three before opening a PR — CI runs the same checks plus `ip-guard`, and fails on any lint warning.

## Project structure

```
production-master/
├─ packages/                 # npm workspaces (client core + per-IDE adapters)
├─ docs/                     # documentation (you are here)
│  ├─ user/                  # install, usage, troubleshooting, commands
│  └─ engineering/           # architecture, decisions, guides, build-and-release
├─ assets/                   # banner and static assets
└─ README.md
```

The intended package split mirrors the four thin-client concerns — auth, MCP transport, streaming, render adapters — described in the [architecture overview](../architecture/overview.md).

## The one rule to keep in mind

This is a **thin client**. Do not add investigation logic, model/provider SDKs, or analysis code — that lives on the hosted service. CI's `ip-guard` job enforces this and will fail your PR if disallowed content is introduced. See [ADR-001](../decisions/ADR-001-initial-architecture.md).

## Next

- [Architecture overview](../architecture/overview.md) — how the pieces fit
- [Build & release](../build-and-release/README.md) — CI and release flow
- [Contributing](../../CONTRIBUTING.md) — branching, commits, PRs
