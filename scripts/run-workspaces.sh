#!/usr/bin/env bash
set -euo pipefail
# Runs an npm script across all workspaces. No-op while packages/* is empty
# (scaffold state) so CI can be green pre-population; STRICT once any workspace
# exists — a failing workspace script fails the build. Do not add '|| true'.
script="${1:?usage: run-workspaces.sh <npm-script>}"
cd "$(dirname "$0")/.."
if ! ls packages/*/package.json >/dev/null 2>&1; then
  echo "run-workspaces: no workspaces yet — skipping '${script}'"
  exit 0
fi
npm run "$script" --workspaces --if-present
