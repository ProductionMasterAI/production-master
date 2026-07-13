# AGENTS.md — Production Master (thin client)

> **Read this first.** This is the **single canonical agent policy** for this repo, for
> all AI coding agents (Claude Code, Cursor, Copilot, Codex, …). `CLAUDE.md` starts with
> `@AGENTS.md`; `.cursor/rules/000-project.mdc` and `docs/agent-guidelines/README.md` are
> thin pointers back here. Edit the policy **here** — never fork it into the adapters.

## What this repo is

Production Master is an autonomous incident-investigation product. **This repo is the
thin client** over the hosted service: it renders investigation reports, streams live
progress, and triggers new investigations from inside editors and IDEs. It is a
presentation-and-transport layer, nothing more.

- **All investigation logic lives server-side**, in the hosted service's private repo:
  the pipeline, agent reasoning, prompts, retrieval, scoring, and evaluation data. This
  repo **never** contains any of it and never reimplements it locally.
- The client talks to the hosted service exclusively over its public HTTP/streaming API.
  It holds no model calls, no orchestration, no business rules about how an investigation
  is run — only how it is displayed and invoked.
- Being public, this repo must stay free of anything proprietary to the service. If you
  find yourself needing pipeline internals to do a task here, the task is on the wrong
  side of the boundary — stop and flag it.

## Layout

| Path | Role |
|---|---|
| `packages/plugin-core/` | Host-neutral core: API client, streaming, report rendering, shared types |
| `packages/adapter-*/` | Per-IDE/editor adapters (one package per host); IDE-specific code lives **only** here |
| `docs/` | Contributor and agent guidelines; `docs/agent-guidelines/` points back to this file |
| `.github/` | CI workflows, issue/PR templates, Dependabot config |

TypeScript, npm **workspaces** (`packages/*`). The core is imported by every adapter;
adapters are never imported by the core.

## Build & verify

Definition of done = **all of the following green**, with the command output cited:

```bash
nvm use            # pin the Node version from .nvmrc
npm ci             # clean, lockfile-faithful install
npm run build      # compile every workspace
npm test           # run the full test suite
npm run lint       # lint + format check (CI fails on warnings)
```

Never claim a change works without pasting the relevant passing output. A green typecheck
alone is not proof a feature works — exercise the affected path.

## Hard constraints

1. **No LLM/provider SDK imports — ever.** No `openai`, `@anthropic-ai/*`, `@google/*`
   GenAI, `cohere`, `mistral`, or any model-provider client anywhere in this repo. The
   client never calls a model directly; it calls the hosted service. **CI grep-enforces
   this** (the ip-guard job) — a violating import fails the build.
2. **No server-side pipeline logic.** No investigation-pipeline steps, agent prompts,
   retrieval/scoring code, or evaluation datasets. That is the hosted service's private
   code and must not appear here even as a copy, fixture, or comment.
3. **CI is GitHub-hosted `ubuntu-latest` only.** Every workflow runs on GitHub-hosted
   runners. Never reference self-hosted runner labels; this public repo has no private
   runner fleet.
4. **Host-neutral core.** IDE/editor-specific code belongs in an `adapter-*` package.
   `plugin-core` must build and test with no editor host present. Don't leak a host API
   into the core.
5. **No secrets in code or config.** No tokens, keys, or endpoints baked into source or
   committed config. Use environment-variable substitution only; document required vars
   in `docs/`. Secret scanning runs in CI.

## Branch & commit conventions

- `main` is the default branch and is always releasable.
- Branch per change: `feat/<slug>` or `fix/<slug>` off `main`.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, …). Every commit ends
  with the trailer:

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

## PR workflow

- Open a PR against `main`; keep it focused and reviewable.
- CI must be **fully green** — build, test, lint, secret-scan, and the **ip-guard** job
  (the no-provider-SDK / no-pipeline-logic grep) — before merge.
- **Squash merge**, then **delete the branch**.
- Open the PR and share the URL; do not merge until checks pass. Never blindly merge on a
  red or pending gate.

## Dependency management

Dependabot is configured under `.github/dependabot.yml`. Rules:

- **Only ecosystems actually present** in the repo (npm, github-actions) get a Dependabot
  entry — no speculative ecosystems.
- **Cadence:** `npm` **weekly**, `github-actions` **monthly**. Never `daily`.
- **Group** minor + patch updates into a single PR **per ecosystem** — no per-dependency
  PR storms.
- **Block automatic semver-major** bumps with an `ignore` rule
  (`update-types: ["version-update:semver-major"]`); majors are handled deliberately by a
  human/agent, not auto-proposed.
- **`open-pull-requests-limit: 3`** (or lower) per ecosystem. Never raise it to allow
  per-dependency PRs.
- **Never blindly merge a Dependabot PR** — CI (including ip-guard) must pass first, and
  the change reviewed, before merge.

## Where the boundary is (quick test)

Ask: *"Does this change decide anything about how an investigation runs?"* If yes, it
belongs in the hosted service, not here. This repo only decides how results are shown and
how a run is requested.

## Skills bridge

Developer workflow skills live in **`.claude/skills/`** — that directory is the single
canonical skills location for ALL agents (there is deliberately no `.agents/skills/`
mirror to drift out of sync). Non-Claude agents should read skill definitions from
`.claude/skills/` directly; each skill is plain markdown with no Claude-specific runtime
dependency.

## Versioning & changelog

The repo follows [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html). Record every
user-facing change in the root [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]`
as part of the PR that makes the change. Full policy:
[versioning policy](docs/engineering/build-and-release/versioning.md).
