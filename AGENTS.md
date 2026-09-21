# Agent instructions — production-master

This repo has no `CLAUDE.md`; agent-capable tools that look for one (Claude
Code 2.1.277+ among them) read this file instead. The full, authoritative
rules live in [`.claude/rules/constraints.md`](.claude/rules/constraints.md)
— read that before making any change. This file is the short version every
session should see up front.

## The essentials

1. **No secrets, ever.** Config comes from the environment at runtime; never
   commit credentials, tokens, or `.env` files.
2. **No force-push to `main`.** All changes land through a pull request.
3. **No unreviewed `.github/workflows/` edits.** Workflow changes need an
   explicit review on the PR.
4. **PUBLIC-REPO SCOPE BOUNDARY (most important).** This repo is the thin
   client only — it talks to the hosted Production Master service over its
   public HTTP interface. It must **never** contain pipeline/agent logic or
   import an LLM/model-provider SDK of any kind. CI enforces this with an
   `ip-guard` check and a no-LLM-SDK-import check; either failing fails the
   build. If a feature needs a provider SDK or local model logic, it belongs
   in the hosted service, not here.
5. **GitHub-hosted runners only.** Never add a `self-hosted` runner label to
   any workflow — this is public, fork-PR territory.
6. **Host-neutral core; IDE behavior lives in adapters.** Core packages make
   no assumptions about a specific editor. Per-IDE behavior lives in
   `packages/adapter-*`.

## Verifying a change

Run the same gates CI does before opening a PR — the
[`run-production-master`](.claude/skills/run-production-master/SKILL.md)
skill scripts this end to end: install, build all workspaces, test, lint,
then validate install manifests.
