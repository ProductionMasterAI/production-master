"""Pure projection fold — Python mirror of the TS reducer's canonical digest.

This mirrors ``@production-master/plugin-core`` ``fold`` (see
``packages/plugin-core/src/projections/index.ts``) for the ten digest fields
ONLY. It exists so the Python SDK and the TS core agree, byte-for-byte, on the
projection they derive from the same recorded event stream
(``tests/fixtures/sse/events.jsonl``). Both sides assert against the same golden
``tests/fixtures/sse/expected-projection.json``.

Scope: this is NOT the full projection (no per-agent detail, no log bodies, no
pipeline labels). It computes only the stable cross-language digest. Keep it in
lock-step with the TS reducer — if the TS ``toDigest`` changes, change this too.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List

# investigation.* lifecycle types map directly to a run status. Mirrors the TS
# STATUS_BY_TYPE table, which is applied as the authoritative override for these
# event types (so e.g. investigation.status_changed always resolves to running).
_STATUS_BY_TYPE = {
    "investigation.created": "created",
    "investigation.status_changed": "running",
    "investigation.completed": "completed",
    "investigation.failed": "failed",
}

# Event types the TS reducer handles with an explicit case. Any type NOT in this
# set falls through to the reducer's default branch, which emits a log line when
# the payload carries a `message`. We replicate that here for `logCount`.
_HANDLED_TYPES = frozenset(
    {
        "investigation.created",
        "investigation.status_changed",
        "investigation.completed",
        "investigation.failed",
        "phase.started",
        "phase.completed",
        "agent.invoked",
        "agent.completed",
        "agent.tool_call.completed",
        "cost.consumed",
        "action.proposed",
        "action.approved",
        "action.executed",
    }
)


def _round6(n: float) -> float:
    """Round to 6 decimals using the SAME rule as TS ``round6``.

    TS: ``Math.round(n * 1e6) / 1e6`` where ``Math.round`` rounds half up, i.e.
    ``floor(n * 1e6 + 0.5) / 1e6``. Python's built-in ``round`` uses banker's
    rounding, so we must NOT use it here.
    """
    return math.floor(n * 1_000_000 + 0.5) / 1_000_000


def _str(payload: Dict[str, Any], key: str) -> Any:
    v = payload.get(key)
    return v if isinstance(v, str) else None


def _num(payload: Dict[str, Any], key: str) -> float:
    v = payload.get(key)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0.0


def project(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Fold an event list into the canonical projection digest.

    Events are ordered by ``sequence`` first (the TS fold sorts identically), so
    the result is order-independent for a given stream.
    """
    ordered = sorted(events, key=lambda e: e.get("sequence", 0))

    status = "created"
    title = None
    report_uri = None
    cost_usd = 0.0

    steps: Dict[str, str] = {}  # phaseId -> status
    agents: Dict[str, str] = {}  # invocationId -> status
    pending_actions: Dict[str, str] = {}  # actionId -> status
    log_count = 0

    for e in ordered:
        etype = e.get("type", "")
        payload = e.get("payload") or {}

        if etype == "investigation.created":
            title = _str(payload, "title") or title
        elif etype == "investigation.completed":
            report_uri = _str(payload, "reportUri") or report_uri
        elif etype == "phase.started":
            steps[_str(payload, "phaseId") or "unknown"] = "running"
        elif etype == "phase.completed":
            steps[_str(payload, "phaseId") or "unknown"] = "completed"
        elif etype == "agent.invoked":
            inv = _str(payload, "invocationId") or e.get("eventId", "")
            agents[inv] = "invoked"
        elif etype == "agent.completed":
            inv = _str(payload, "invocationId") or ""
            if inv in agents:
                agents[inv] = "completed"
        elif etype == "cost.consumed":
            cost_usd = _round6(cost_usd + _num(payload, "costUsd"))
            # Every cost.consumed event yields a log line (client-side E6).
            log_count += 1
        elif etype == "action.proposed":
            aid = _str(payload, "actionId") or e.get("eventId", "")
            pending_actions[aid] = "proposed"
        elif etype == "action.approved":
            aid = _str(payload, "actionId") or ""
            if aid in pending_actions:
                pending_actions[aid] = "approved"
        elif etype == "action.executed":
            aid = _str(payload, "actionId") or ""
            if aid in pending_actions:
                pending_actions[aid] = "executed"
        elif etype not in _HANDLED_TYPES:
            # Default branch: a generic log line for any event carrying `message`.
            if isinstance(payload.get("message"), str):
                log_count += 1

        # STATUS_BY_TYPE override — authoritative for lifecycle events.
        if etype in _STATUS_BY_TYPE:
            status = _STATUS_BY_TYPE[etype]

    return {
        "status": status,
        "title": title,
        "reportUri": report_uri,
        "costUsd": _round6(cost_usd),
        "stepCount": len(steps),
        "stepsCompleted": sum(1 for s in steps.values() if s == "completed"),
        "agentCount": len(agents),
        "agentsCompleted": sum(1 for s in agents.values() if s == "completed"),
        "pendingActionCount": len(pending_actions),
        "logCount": log_count,
    }
