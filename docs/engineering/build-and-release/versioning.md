# Versioning & release policy

One-sentence purpose: how this repo assigns versions, records changes, and cuts releases.

## Semantic Versioning

Versions follow [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html): `MAJOR.MINOR.PATCH`.

- **MAJOR** — breaking change to the client's public surface: the commands/tools an
  editor sees, the configuration format, or the minimum supported service API.
- **MINOR** — new capability added backward-compatibly (new adapter, new command, new
  render surface).
- **PATCH** — fixes and internal cleanups with no surface impact.

All `packages/*` workspaces version together with the repo; the current version is
reflected in the README version badge and the top of [`CHANGELOG.md`](../../../CHANGELOG.md).

## Changelog

Every user-facing change is recorded in the root [`CHANGELOG.md`](../../../CHANGELOG.md)
under `## [Unreleased]`, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
(`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`). The entry ships
in the same PR as the change.

## Releases

1. Move `## [Unreleased]` entries under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
2. Bump the version in the root `package.json` (and any workspace manifests) and the
   README version badge in the same PR.
3. After merge, tag `vX.Y.Z` on `main` and publish a GitHub release; the release
   workflow attaches build artifacts.

See the [build-and-release guide](README.md) for the mechanics.
