"""Cross-language projection parity (Python side, #118).

Loads the SAME recorded stream the TS core folds
(``tests/fixtures/sse/events.jsonl``) and asserts ``project(...)`` deep-equals
the SAME committed golden (``tests/fixtures/sse/expected-projection.json``). The
TS counterpart lives at
``packages/plugin-core/src/projections/cross-language-parity.test.ts`` — both
suites pin the one golden file, so a drift in either reducer surfaces as a
mismatch here.
"""

from __future__ import annotations

import json
from pathlib import Path

from production_master import project

# sdk/python/tests -> repo root is three levels up. Resolve so the test is
# robust to the current working directory pytest is launched from.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_FIXTURE_DIR = _REPO_ROOT / "tests" / "fixtures" / "sse"
_EVENTS = _FIXTURE_DIR / "events.jsonl"
_GOLDEN = _FIXTURE_DIR / "expected-projection.json"


def _load_events() -> list[dict]:
    lines = _EVENTS.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def test_project_matches_golden_digest() -> None:
    digest = project(_load_events())
    golden = json.loads(_GOLDEN.read_text(encoding="utf-8"))
    assert digest == golden


def test_project_is_order_independent() -> None:
    events = _load_events()
    forward = project(events)
    reverse = project(list(reversed(events)))
    assert forward == reverse
