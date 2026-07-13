# Hard Constraints — production-master (PUBLIC thin-client)

These are non-negotiable rules for any agent working in this repository. CI enforces
several of them; violating one fails the build.

## 1. No secrets, ever

Never commit secrets, credentials, API keys, tokens, or `.env` files. Configuration is
read from the environment at runtime — the repo ships no baked-in credentials. If a
value looks like a secret, it does not belong in a tracked file.

## 2. No force-push to `main`

Never `git push --force` (or `-f`) to `main`. All changes land through a pull request;
`main` is only ever fast-forwarded by a merge.

## 3. No unreviewed workflow changes

Do not modify anything under `.github/workflows/` without an explicit review on the PR.
Workflow edits are a supply-chain surface and require a second set of eyes.

## 4. PUBLIC-REPO IP BOUNDARY (most important)

This repo is **public** and contains **only the thin client** — the code that talks to
the hosted service over its public HTTP interface. It must **never** contain:

- server-side pipeline / investigation logic,
- agent prompts or prompt templates,
- evaluation fixtures, golden datasets, or scoring harnesses,
- any LLM / model-provider SDK import (no provider client libraries of any kind).

All intelligence lives behind the hosted service's API and stays private. CI runs an
`ip-guard` check plus a no-LLM-SDK import check; adding any of the above fails the
build. If a feature seems to need one of these, it belongs in the private service repo,
not here.

## 5. GitHub-hosted runners ONLY

CI runs on GitHub-hosted `ubuntu-latest` runners **only**. Never add a `self-hosted`
runner label to any workflow. This is public + fork-PR territory: a self-hosted label
would let a fork's PR execute untrusted code on private infrastructure.

## 6. Host-neutral core; IDE behavior lives in adapters

The core packages stay host-neutral — they make no assumptions about a specific IDE or
editor. All IDE-specific behavior lives in the per-IDE adapter packages under
`packages/`. Keep the seam clean: core exposes a neutral interface, each adapter
implements it.
