# Documentation

Documentation for **production-master**, the IDE thin client for the Production Master hosted service.

Start with the [project README](../README.md) for the elevator pitch and install steps, then use the map below to find what you need.

## User docs

| Doc | Read it when |
|-----|--------------|
| [Quick Start](user/quick-start.md) | You want to install the client, log in, and run your first investigation |
| [Usage](user/usage.md) | You know the basics and want the common workflows (start, connect, approve/reject) |
| [Troubleshooting](user/troubleshooting.md) | Login fails, the service URL is wrong, or the editor doesn't see the client |
| [Command reference](user/reference/commands.md) | You want the full list of thin-client commands |

## Engineering docs

| Doc | Read it when |
|-----|--------------|
| [Architecture overview](engineering/architecture/overview.md) | You want to understand the thin-client components and data flow |
| [ADR-001 — Thin client over hosted service](engineering/decisions/ADR-001-initial-architecture.md) | You want the rationale behind the client/service split |
| [Getting started (dev)](engineering/guides/getting-started.md) | You're setting up the repo to contribute |
| [Build & release](engineering/build-and-release/README.md) | You want the build, test, and release process |

## Project docs

| Doc | Purpose |
|-----|---------|
| [Contributing](CONTRIBUTING.md) | Branching, commits, and PR process |
| [Changelog](../CHANGELOG.md) | Release history |

## Scope reminder

This repo is a **thin client only**. Anything about how investigations are actually run — analysis, models, data sources — is out of scope here and lives with the hosted service. If a doc starts describing investigation internals, it's in the wrong repo.
