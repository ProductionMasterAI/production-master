# Build & release

How the thin client is built, tested, and released.

## Build

The repo is an npm workspaces monorepo (`packages/*`). Build all workspaces from the root:

```bash
npm ci            # install
npm run build     # build all workspaces
```

Each package compiles TypeScript to its own output. The build must stay dependency-clean: no model/provider SDKs, no analysis logic — see [ADR-001](../decisions/ADR-001-initial-architecture.md).

## Test

```bash
npm test          # run the full suite
npm run lint      # lint — CI runs with max-warnings 0
```

Run all checks locally before opening a PR; CI runs the same set and will fail on any lint warning.

## Continuous integration

CI runs on **GitHub-hosted `ubuntu-latest`** and is the required gate for every PR. Jobs:

| Job | What it checks |
|-----|----------------|
| `build` | All workspaces compile (`npm run build`) |
| `lint` | Lint passes with zero warnings |
| `test` | Test suite passes (`npm test`) |
| `ip-guard` | No investigation logic, provider SDKs, or disallowed content entered the public repo |

All jobs must be green before a PR can merge. `ip-guard` is what keeps this repo a genuinely thin, publish-safe client — treat a failure there as a scope violation, not a flake.

## Versioning

The project follows [Semantic Versioning](https://semver.org/). Record every user-facing change in [CHANGELOG.md](../../../CHANGELOG.md) under `## [Unreleased]` as part of the PR that makes the change.

- **patch** — bug fixes, no behavior change.
- **minor** — new backward-compatible functionality.
- **major** — breaking changes to the client's command surface or the service contract it depends on.

## Release

1. Move the `## [Unreleased]` entries into a new versioned section in `CHANGELOG.md` with the date.
2. Bump the version and tag `vX.Y.Z`.
3. Pushing the tag triggers the release workflow, which publishes the GitHub release with generated notes.

Keep releases coordinated with the hosted service when a change depends on a new service-contract behavior — the client and service share the HTTPS + SSE contract.
