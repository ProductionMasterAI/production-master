# Agent guidelines

The canonical agent policy for this repository lives in **[`AGENTS.md`](../../AGENTS.md)**
at the repo root. Start there.

This directory is a stub index — it exists so agents that look under `docs/` for
guidance are pointed back to the single source of truth. Do not duplicate policy here.

## Quick links

- **[`AGENTS.md`](../../AGENTS.md)** — canonical policy: what this repo is (thin client),
  layout, build & verify, hard constraints, branch/commit/PR conventions, dependency
  management.
- **[`CLAUDE.md`](../../CLAUDE.md)** — Claude Code addenda (imports `AGENTS.md`).
- **[`.cursor/rules/000-project.mdc`](../../.cursor/rules/000-project.mdc)** — Cursor
  pointer to `AGENTS.md`.

## The one thing to remember

Production Master's client repo is a **thin presentation-and-transport layer** over the
hosted service. All investigation logic — pipeline, prompts, retrieval, evaluation data —
is server-side and never lives here. No provider SDKs, no pipeline code; CI enforces both.
