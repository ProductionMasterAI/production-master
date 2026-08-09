"""A fake :class:`Transport` so the SDK is testable without a network."""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, Iterator, List, Optional, Tuple

from production_master.transport import Request, Response


class FakeTransport:
    """Records requests and replays queued responses / SSE frame batches.

    * ``enqueue(method, path, status, body=None, text="")`` queues a unary
      response for ``(method, path)`` (FIFO).
    * ``enqueue_stream(frames)`` queues a batch of raw SSE ``data`` payloads;
      each call to :meth:`open_stream` consumes the next batch.
    """

    def __init__(self) -> None:
        self.requests: List[Request] = []
        self.stream_requests: List[Request] = []
        self._responses: Dict[Tuple[str, str], Deque[Response]] = {}
        self._streams: Deque[List[str]] = deque()

    # -- queue setup -------------------------------------------------------

    def enqueue(
        self,
        method: str,
        path: str,
        status: int,
        body: Any = None,
        text: str = "",
    ) -> "FakeTransport":
        key = (method.upper(), path)
        self._responses.setdefault(key, deque()).append(
            Response(status=status, body=body, text=text)
        )
        return self

    def enqueue_stream(self, frames: List[Dict[str, Any]]) -> "FakeTransport":
        # Store as JSON strings, exactly what open_stream yields on the wire.
        self._streams.append([json.dumps(f) for f in frames])
        return self

    def enqueue_raw_stream(self, raw_frames: List[str]) -> "FakeTransport":
        """Queue a batch of ALREADY-serialized SSE data payloads.

        Unlike :meth:`enqueue_stream` (which ``json.dumps`` valid dicts) this
        yields the strings verbatim, so tests can inject genuinely malformed
        frames (invalid JSON, truncated payloads) into ``stream_events``.
        """

        self._streams.append(list(raw_frames))
        return self

    # -- Transport protocol -----------------------------------------------

    def request(self, req: Request) -> Response:
        self.requests.append(req)
        key = (req.method.upper(), req.path)
        queue = self._responses.get(key)
        if not queue:
            raise AssertionError(f"no queued response for {key}")
        if len(queue) == 1:
            return queue[0]  # last response is sticky
        return queue.popleft()

    def open_stream(self, req: Request) -> Iterator[str]:
        self.stream_requests.append(req)
        if not self._streams:
            return iter(())
        return iter(self._streams.popleft())

    # -- assertions helpers ------------------------------------------------

    def last_request(self) -> Request:
        return self.requests[-1]

    def requests_for(self, method: str, path: str) -> List[Request]:
        return [r for r in self.requests if r.method.upper() == method.upper() and r.path == path]


@dataclass
class EmulatedBff:
    """A schema-real BFF emulator over :class:`FakeTransport` (issue #119).

    Mirrors the TS ``EmulatedBff`` (``packages/plugin-core``): a single stateful
    emulator seeded with one investigation, serving the real v1 routes the
    Python client parses -- ``POST /v1/runs`` -> 202 ``{investigationId}``,
    ``GET /v1/runs/{id}``, ``GET /v1/runs/{id}/report``, and the SSE event
    stream. ``run`` / ``report`` / ``events`` are the schema-real bodies a
    round-trip test asserts against.
    """

    transport: "FakeTransport"
    investigation_id: str
    run: Dict[str, Any]
    report: Dict[str, Any]
    events: List[Dict[str, Any]]


def build_emulated_bff(investigation_id: str = "inv_emulated") -> EmulatedBff:
    """Seed a :class:`FakeTransport` with the schema-real v1 route surface."""

    report_uri = f"https://production-master-service.vercel.app/v1/runs/{investigation_id}/report"
    run: Dict[str, Any] = {
        "investigationId": investigation_id,
        "status": "completed",
        "title": "Checkout 500s after deploy",
        "createdAt": "2026-06-30T10:00:00.000Z",
        "completedAt": "2026-06-30T10:04:12.000Z",
        "reportUri": report_uri,
        "costUsd": 0.42,
    }

    def _env(seq: int, type_: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "eventId": f"evt_{seq}",
            "investigationId": investigation_id,
            "type": type_,
            "sequence": seq,
            "timestamp": "2026-06-30T10:00:00.000Z",
            "schemaVersion": "investigation.events.v1",
            "payload": payload,
        }

    events: List[Dict[str, Any]] = [
        _env(1, "investigation.created", {"title": run["title"]}),
        _env(2, "investigation.status_changed", {"status": "running"}),
        _env(3, "phase.started", {"phaseId": "understand", "label": "Understand"}),
        _env(4, "investigation.completed", {"reportUri": report_uri}),
    ]

    # Python get_report(format="json") returns the parsed RCA body directly.
    report: Dict[str, Any] = {
        "investigationId": investigation_id,
        "verdict": "CONFIRMED",
        "rootCause": "Null deref in the checkout handler after the deploy.",
    }

    transport = FakeTransport()
    transport.enqueue("POST", "/v1/runs", 202, body={"investigationId": investigation_id})
    transport.enqueue("GET", f"/v1/runs/{investigation_id}", 200, body=run)
    transport.enqueue("GET", f"/v1/runs/{investigation_id}/report", 200, body=report)
    transport.enqueue_stream(events)

    return EmulatedBff(
        transport=transport,
        investigation_id=investigation_id,
        run=run,
        report=report,
        events=events,
    )
