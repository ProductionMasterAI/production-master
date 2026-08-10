"""Per-adapter SSE edge cases for the Python client (issue #119, Task B).

Beyond the single conformance scenario: a mid-stream drop + resume that dedupes
by eventId across the reconnect overlap (no gaps, no dupes), and graceful
handling of malformed frames both at the :func:`parse_sse_bytes` layer and
through ``stream_events`` (fake transport yielding bad raw frames).
"""

from __future__ import annotations

import json

from production_master import Client
from production_master.sse import parse_sse_bytes
from tests.fakes import FakeTransport


def _env(seq, event_id, type_="agent.progress", payload=None):
    return {
        "eventId": event_id,
        "investigationId": "inv_1",
        "type": type_,
        "sequence": seq,
        "timestamp": "2026-06-30T00:00:00Z",
        "schemaVersion": "1",
        "payload": payload or {},
    }


def test_reconnect_dedupes_by_event_id_across_overlap_with_no_gaps():
    t = FakeTransport()
    # First connection delivers e1, e2, e3 then closes (drop).
    t.enqueue_stream([_env(1, "e1"), _env(2, "e2"), _env(3, "e3")])
    # Reconnect REPLAYS e2, e3 (overlap the server resends) and delivers e4, e5.
    t.enqueue_stream(
        [
            _env(2, "e2"),
            _env(3, "e3"),
            _env(4, "e4"),
            _env(5, "e5", type_="investigation.completed"),
        ]
    )
    client = Client(service_url="https://bff.test", transport=t, token="tok")

    events = list(client.stream_events("inv_1"))
    seqs = [e.sequence for e in events]
    ids = [e.event_id for e in events]

    # No gaps: every sequence 1..5 exactly once, in order.
    assert seqs == [1, 2, 3, 4, 5]
    # No dupes: the overlap-replayed e2/e3 were deduped.
    assert len(ids) == len(set(ids)) == 5
    # Resume: the reconnect carried the last delivered id before the drop.
    assert len(t.stream_requests) == 2
    assert "Last-Event-ID" not in t.stream_requests[0].headers
    assert t.stream_requests[1].headers["Last-Event-ID"] == "e3"


def test_parse_sse_bytes_skips_malformed_frames_gracefully():
    chunks = [
        b'data: {"eventId":"e1","sequence":1}\n\n',  # valid
        b": just a comment\n\n",  # no data: line -> dropped
        b"data:\n\n",  # empty data -> yields ""
        b"data: not-json\n\n",  # yields "not-json" (invalid JSON downstream)
        b'data: {"eventId":"e2","sequence":2}',  # partial trailing frame -> flushed
    ]

    payloads = list(parse_sse_bytes(chunks))

    # The comment-only frame is dropped; empty + malformed + trailing all survive
    # the parser without raising.
    assert '{"eventId":"e1","sequence":1}' in payloads
    assert '{"eventId":"e2","sequence":2}' in payloads  # trailing flushed
    assert "" in payloads  # empty data frame
    assert "not-json" in payloads

    # Only the well-formed JSON payloads parse; the rest are skipped, no crash.
    parsed = []
    for p in payloads:
        try:
            parsed.append(json.loads(p))
        except ValueError:
            pass
    assert [d["eventId"] for d in parsed] == ["e1", "e2"]


def test_stream_events_skips_malformed_raw_frames_without_crashing():
    t = FakeTransport()
    t.enqueue_raw_stream(
        [
            "not json at all",  # invalid JSON
            json.dumps({"foo": "bar"}),  # valid JSON, missing eventId/sequence
            json.dumps({"eventId": "e1", "sequence": "x"}),  # non-int sequence
            json.dumps(_env(1, "e1", type_="investigation.completed")),  # valid
        ]
    )
    client = Client(service_url="https://bff.test", transport=t, token="tok")

    events = list(client.stream_events("inv_1"))

    # Every bad frame is skipped; only the valid terminal event is delivered.
    assert [e.event_id for e in events] == ["e1"]
