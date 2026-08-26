# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pin↔doc guard + changelog structure lint, wired into the required `CI`
  job (dev#726).** `scripts/check-version-pin-docs.mjs` asserts the root pin
  files (`.claude-code-version`, `.codex-version`, `.cursor-version`) and
  `docs/user/platform-support.md` agree pairwise, per pin — a value present
  in the doc but attached to the wrong pin's row now fails instead of
  passing a presence-only check (dev#718's swap failure mode).
  `scripts/check-changelog-structure.mjs` asserts every `## [Unreleased]`
  bullet sits under a Keep a Changelog category header (plugin#37's
  orphaned-bullet regression). Both run as steps in the `CI` job, the sole
  required status context on this repo's `main`.

### Changed

- **Claude Code currency (2.1.245 → 2.1.246).** `.claude-code-version`
  advances to **2.1.246**. Registration, sandboxing configuration shape, and
  command-argument handling are unchanged. One item updates existing
  guidance: 2.1.246 fixed the command sandbox's filesystem configuration not
  respecting `--setting-sources`, which could make the `denyRead`/`denyWrite`/
  masking protection on a `PM_ACCESS_TOKEN` credentials file disagree with
  the setting source `--setting-sources` was told to include or exclude —
  noted in
  [Troubleshooting](docs/user/troubleshooting.md#sandboxed-commands-claude-code).
  Everything else in 2.1.246 is host-side UI, CLI, and reliability work with
  no client-relevant surface (see
  [Platform support](docs/user/platform-support.md) for the full per-item
  review), including the MCP-as-client fixes that don't apply because Claude
  Code registers this plugin via `/plugin install`, not MCP.

- **Claude Code currency (2.1.241 → 2.1.245).** `.claude-code-version`
  advances to **2.1.245**. Registration, sandboxing configuration shape, and
  command-argument handling are unchanged. 2.1.245 shipped only a
  Linux-glibc-2.44 startup crash fix (host binary, no client-relevant
  surface); 2.1.244, 2.1.242, and 2.1.240 shipped no separately documented
  changes. Reviewed and not applicable from 2.1.243: the `/usage` Loops
  breakdown, `modelPicker`/`promptCacheTtl`/`subagentPromptCacheTtl`/
  `modelPricing` settings, and the `/tasks` model+effort column (this thin
  client makes no model calls and spawns no subagents — constraint #4); the
  keyless Console sign-in, `/web-setup` tip, and the claude.ai `managed`
  connector marker (this plugin is never installed as a claude.ai-synced or
  org-managed connector); the `claude-code-action` workload-identity-
  federation CI fix (`.github/workflows/claude.yml` authenticates with
  `anthropic_api_key`, not WIF); the hook `if`-condition and
  `/reload-plugins` LSP fixes (no hooks, no LSP plugin here); and the
  `--agents` JSON-validation fix (no command launches with `--agents`). One
  item updates existing guidance: 2.1.243 changed the sandboxed Bash tool to
  stop listing allowed network hosts in non-`strictAllowlist` mode, so
  Claude now attempts and prompts for approval on `api.productionmaster.dev`
  instead of assuming it's blocked — noted in
  [Troubleshooting](docs/user/troubleshooting.md#investigations-fail-with-connection-errors-only-inside-claude-code)
  so the `strictAllowlist`-only hard-block guidance isn't misread as
  covering every sandbox mode.

- **Claude Code currency (2.1.238 → 2.1.241).** `.claude-code-version`
  advances to **2.1.241**. Registration, sandboxing configuration shape, and
  command-argument handling are unchanged. Reviewed and not applicable:
  2.1.239's `/cost`/status-line/`--max-budget-usd` US-only-inference premium
  and the Bedrock/Vertex/Foundry fullscreen-renderer offer (this thin client
  shows no cost estimate and is not a model-provider console); `/claude-api
  upgrade` for `anthropic` 0.x→1.x Python projects (constraint #4 forbids any
  model-provider SDK import — there is no `anthropic` dependency anywhere in
  this repo to migrate); the `name@synced` naming for plugins synced from
  claude.ai (this plugin installs via `/plugin install
  production-master@<marketplace>` from a marketplace hosted elsewhere, or
  the SHA-256-pinned `archive` source documented in [Quick
  Start](docs/user/quick-start.md#claude-code) — never through a claude.ai
  sync); the Alpine/musl native-addon fix (this CLI ships no native
  add-ons); and the usage-limit reset-time message wording. 2.1.240 and
  2.1.241 shipped only "bug fixes and reliability improvements," with no
  further detail published — nothing to review there.

- **Claude Code currency (2.1.236 → 2.1.238) (#43).** `.claude-code-version`
  advances to **2.1.238**. Registration, sandboxing configuration shape, and
  command-argument handling are unchanged across 2.1.237 and 2.1.238.
  Reviewed and not applicable: 2.1.237's built-in "Concise" output style
  (opt-in under `/config`) and its prompt-caching fix for gateway/custom-
  base-URL sessions — this repo ships no output-style file, and the client
  never calls a model directly (constraint #4); 2.1.238's plugin-marketplace
  `headersHelper` — no marketplace or catalog entry lives in this repo for
  it to attach to; the new `self-hosted-runner` flags — this repo's CI runs
  GitHub-hosted `ubuntu-latest` only (constraint #5); the subagent-tool-
  result memory-growth fix and the output-style-drift fix — no subagents,
  no output style here; and the stdio-MCP-server `server/discover`-before-
  `initialize` fix — Claude Code is never this thin client's MCP client.

### Fixed

- docs: fix quick-start/troubleshooting to stop naming a nonexistent npm
  package (#44).
