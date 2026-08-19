# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Claude Code currency (2.1.234 → 2.1.236).** `.claude-code-version` advances to
  **2.1.236**. Registration, sandboxing configuration shape, and command-argument
  handling are unchanged; the only client-relevant item is 2.1.236's hardening of
  macOS sandbox wildcard `denyRead` rules (now honored inside allowed read
  regions, covering matched directories' contents, and no longer bypassable by
  renaming the denied file) — closing the same sandboxed-file-protection bypass
  family as the 2.1.224 Linux/macOS trailing-slash fix and the 2.1.234 Windows
  NT-namespace-path fix. macOS users protecting a `PM_ACCESS_TOKEN` credentials
  file with a wildcard sandbox deny entry now get the same guarantee Linux
  already had. Everything else in the 2.1.235–2.1.236 range is host-side
  UI/perf/reliability work with no client-relevant surface. See
  [Platform support](docs/user/platform-support.md) for the full delta.
- **Claude Code currency (2.1.233 → 2.1.234).** `.claude-code-version` advances to
  **2.1.234**. Registration, sandboxing, and command-argument handling are
  unchanged; the only client-relevant item is 2.1.234's hardening against
  Windows NT-namespace path reads, which closes the same sandboxed-file-protection
  bypass family as the 2.1.224 Linux/macOS trailing-slash `denyRead` fix — Windows
  users protecting a `PM_ACCESS_TOKEN` credentials file with a sandbox deny entry
  now get the same guarantee. See [Platform support](docs/user/platform-support.md)
  for the full delta.
- **Cursor desktop 3.16.29 + Origin CLI/integrations:** re-pin desktop/`validated_against` **3.16.17 → 3.16.29** (stable download line 2026-08-18; no separate feature write-up). Document Origin CLI, agent-created Origin repos, and Origin↔Automations/Cloud Agents / apps integrations. Feature/date pins stay **3.11** / **2026-08-17**.
- **Cursor Origin + Builds default (2026-08-17).** Documented [Origin](https://cursor.com/docs/origin) (early-beta Cursor git forge; GitHub remains canonical for this public thin client) and flipped Cloud Agent Builds language to **now default**. Pin bump: `changelog_date` **2026-08-13 → 2026-08-17**; feature **3.11** / desktop **3.16.17** unchanged.

## [0.1.0] - 2026-08-17

First published release. Everything below accumulated pre-release, alongside
the initial scaffold from 2026-07-13 that never actually got tagged — `npm`
and PyPI have returned 404 for these package names until now (dev#642).

### Added

- **npm and PyPI packages published for the first time (dev#642).** `private:
true` removed from the publishable manifests; `packages/pmctl` now publishes
  unscoped as `production-master` (`npx production-master` runs the `pmctl`
  binary) and `packages/plugin-core` publishes as
  `@production-master/plugin-core`, both at `0.1.0`. `sdk/python` publishes to
  PyPI as `production-master`, also `0.1.0`. The four IDE adapter packages
  stay `private` — they ship through their own editor's install mechanism
  (Claude Code plugin marketplace / archive source, `.cursor/mcp.json`,
  `.codex/config.toml`, `opencode.json`), not via `npm install`.

### Added

- **`pmctl` operator CLI (dev#268).** New `packages/pmctl` workspace package — a
  standalone thin-client binary (`login`, `start`, `status`, `report`, `events`,
  `approve`, `reject`) over the same BFF and `@production-master/plugin-core` as every
  editor adapter, for scripting and CI use outside an IDE. Ported from the archived
  personal prototype, with the entry-point detection fixed to compare realpaths so the
  binary works when invoked through its real npm-installed symlink (the original
  string comparison silently produced a no-op CLI in that case).

### Changed
- **Cursor Grok 4.6 + Builds T-1 readiness (2026-08-16).** Platform support + Quick Start document Grok 4.6 for long-running / visual adapter work and a T-1 Builds checklist before the **2026-08-17** default. Pins stay **3.11** / **2026-08-13** / desktop **3.16.17**.

- **Cursor desktop 3.16.17 + Builds skipped/staleness docs.** Desktop pin **3.15.19 → 3.16.17**; docs cover Builds Skipped checks, 24h staleness default, and install/start/terminals. Feature/date pins stay **3.11** / **2026-08-13**.
- **Cursor Builds Aug-17 readiness + CLI steer/`/goal`.** Platform support + Quick Start deepen Builds adoption (enable now ahead of **2026-08-17** default; team/environment secrets; git-staleness) and note CLI steer + durable `/goal` for local debugging. Pins stay **3.11** / **2026-08-13** / desktop **3.16.17**.
- **Cursor CLI Aug 11 tip.** Platform support notes sticky skills and CLI installed-plugin hooks (debugging only).
- **Cursor currency (changelog through 2026-08-13 — Cloud Agent Builds).** `.cursor-version` keeps feature **3.11** / desktop CLI **3.16.17** and advances `changelog_date` to **2026-08-13**. Platform support + Quick Start document Cloud Agent Builds (warm install snapshots; enable on the environment Builds tab). Also covers Agent Plugins standard support, desktop `workspaceOpen` (`pluginPaths`), and Automations memory-file delete.

### Security

- **Canonical API host is now `api.productionmaster.dev`, not
  `api.productionmaster.ai` (dev#468).** Every editor registration, slash
  command, and doc in this repo defaulted `PM_SERVICE_URL` to
  `https://api.productionmaster.ai` — a hostname whose apex, `productionmaster.ai`,
  is **not registered by us and is available to buy**. Anyone who registered it
  would receive the bearer token of every user who never set `PM_SERVICE_URL`.
  The default now points at a subdomain of `productionmaster.dev`, which we do
  own, so the name cannot be claimed by a third party. A second unregistered
  vanity host, `mcp.productionmaster.ai`, was found in the BFF test fixture and
  moved the same way. The 2.1.219 troubleshooting note that told users to
  allowlist the old hostname was corrected in place rather than left standing,
  since following it would firewall-allow a domain we do not control.
  **Update (dev#642):** `api.productionmaster.dev` now resolves and serves the
  BFF — the "inert until DNS lands" caveat above no longer holds. The Python
  SDK's `DEFAULT_SERVICE_URL` has been moved off the service's raw Vercel
  deployment origin onto this vanity host now that it is live. (Every IDE
  adapter and `pmctl` still carry no baked-in default at all — they require
  `PM_SERVICE_URL`/`--service` explicitly — so there is nothing to bring into
  alignment on that side.)

### Added

- **Python SDK (`sdk/python`) — a pure-stdlib thin client for scripting and CI.**
  `Client.start_investigation` → `stream_events` (SSE with `Last-Event-ID` resume)
  → `get_report`, plus the same RFC 8628 device-code login the editors use.
  Zero runtime dependencies, so `pip install` pulls nothing third-party. It is a
  thin client like every other surface: it marshals requests, attaches a stable
  `Idempotency-Key` on mutations, and maps errors — no analysis logic, no LLM SDK.
  The projection reducer is pinned against the TypeScript one by
  `tests/fixtures/sse/expected-projection.json`, asserted from both languages, so
  the two cannot silently diverge. CI gains a `python-sdk` job (3.9 and 3.13) and
  the `no-llm-sdk` guard — previously scanning only JS/TS file types — now covers
  Python source and Python manifests. Publishing is wired but dormant:
  `.github/workflows/publish-python.yml` fires on a `python-v*` tag and uses PyPI
  Trusted Publishing (OIDC), so no long-lived `PYPI_API_TOKEN` is stored here.
- **`PM_SERVICE_URL` is honoured by the Python SDK**, matching every editor
  registration in this repo: explicit `service_url=` beats the variable, which
  beats the built-in default.

- **`.codex-version` — tracked Codex target release (0.147.0).** New root file
  recording the latest Codex release this repo targets, mirroring
  `.claude-code-version`, so version-support updates are diffable and automatable.
  `docs/user/platform-support.md` mirrors it in the Codex `Latest known` column and
  links to the file. Reviewed the 0.147.0 compatibility delta against the existing
  adapter, `.codex/config.toml`, and MCP registration: no client change is required.
  Codex 0.147.0 adds an opt-in MCP 2026-07-28 protocol, which the stdio server
  intentionally does not adopt yet — advertising the newer protocol string alone
  would be unsafe without paginated discovery, multi-round requests, and
  non-blocking startup. `Validated against` stays `pending`: a compatibility review
  is not an end-to-end host test, and host-version validation remains a separate axis.

### Changed

- **Cursor target pinned to 3.11** (changelog covered through **2026-08-03**) via
  new root [`.cursor-version`](.cursor-version). The 3.11 delta was reviewed against
  the existing adapter and the `.cursor/mcp.json` registration shape and needs no
  client change, so `docs/user/platform-support.md` records 3.11 under
  `Latest known` while Cursor's `Validated against` stays `pending` — that column
  tracks an end-to-end test against a released host, which no platform has cleared.
  The same doc now covers Customize-page MCP management (3.9+), Team MCP
