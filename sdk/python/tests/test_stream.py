"""stream_events: ordering, dedupe, Last-Event-ID resume, replay, terminal stop."""

from __future__ import annotations

from production_master import Client
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


def _client(transport, **kw):
    return Client(service_url="https://bff.test", transport=transport, **kw)


def test_resume_sends_last_event_id_and_dedupes():
    t = FakeTransport()
    # First connection delivers e1, e2 then closes.
    t.enqueue_stream([_env(1, "e1"), _env(2, "e2")])
    # Reconnect replays e2 (overlap) and delivers e3.
    t.enqueue_stream([_env(2, "e2"), _env(3, "e3")])
    # Final reconnect delivers nothing -> generator stops.
    t.enqueue_stream([])
    client = _client(t, token="tok")

    events = list(client.stream_events("inv_1"))

    assert [e.sequence for e in events] == [1, 2, 3]
    assert [e.event_id for e in events] == ["e1", "e2", "e3"]

    # The second open_stream must carry Last-Event-ID of the last delivered id.
    assert len(t.stream_requests) == 3
    assert "Last-Event-ID" not in t.stream_requests[0].headers
    assert t.stream_requests[1].headers["Last-Event-ID"] == "e2"
    assert t.stream_requests[2].headers["Last-Event-ID"] == "e3"


def test_terminal_event_stops_stream_without_extra_reconnect():
    t = FakeTransport()
    t.enqueue_stream(
        [_env(1, "e1"), _env(2, "e2", type_="investigation.completed")]
    )
    client = _client(t)

    events = list(client.stream_events("inv_1"))

    assert [e.type for e in events] == ["agent.progress", "investigation.completed"]
    # Terminal event ends the generator: exactly one connection opened.
    assert len(t.stream_requests) == 1


def test_since_seq_replays_durable_slice_first():
    t = FakeTransport()
    t.enqueue(
        "GET",
        "/v1/runs/inv_1/events",
        200,
        body={"events": [_env(3, "e3"), _env(2, "e2")]},  # unordered on purpose
    )
    t.enqueue_stream([_env(4, "e4", type_="investigation.completed")])
    client = _client(t)

    events = list(client.stream_events("inv_1", since_seq=1))

    # Replay slice is sorted by sequence, then the live event follows.
    assert [e.sequence for e in events] == [2, 3, 4]
    # The events endpoint was queried with sinceSeq.
    slice_reqs = t.requests_for("GET", "/v1/runs/inv_1/events")
    assert slice_reqs[0].query == {"sinceSeq": 1}
    # The live stream resumes from the last replayed id.
    assert t.stream_requests[0].headers["Last-Event-ID"] == "e3"


def test_malformed_frames_are_ignored():
    t = FakeTransport()
    # The fake serializes dicts; inject a malformed one missing eventId/sequence.
    t.enqueue_stream([{"not": "an-event"}, _env(1, "e1", type_="investigation.completed")])
    client = _client(t)

    events = list(client.stream_events("inv_1"))

    assert [e.event_id for e in events] == ["e1"]
