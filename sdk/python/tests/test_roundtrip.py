"""The full start -> stream -> report round-trip against the fake transport.

This is the fake-transport stand-in for the live-BFF integration test required
by the acceptance criteria (the real-BFF round-trip is blocked on live infra).
"""

from __future__ import annotations

from production_master import Client
from tests.fakes import FakeTransport


def _env(seq, event_id, type_="agent.progress", payload=None):
    return {
        "eventId": event_id,
        "investigationId": "inv_42",
        "type": type_,
        "sequence": seq,
        "timestamp": "2026-06-30T00:00:00Z",
        "schemaVersion": "1",
        "payload": payload or {},
    }


def test_start_stream_report_roundtrip():
    t = FakeTransport()
    t.enqueue("POST", "/v1/runs", 201, body={"investigationId": "inv_42", "status": "created"})
    t.enqueue_stream(
        [
            _env(1, "e1"),
            _env(2, "e2"),
            _env(3, "e3", type_="investigation.completed", payload={"status": "completed"}),
        ]
    )
    t.enqueue(
        "GET",
        "/v1/runs/inv_42/report",
        200,
        body={"verdict": "CONFIRMED", "rootCause": "null deref"},
    )

    client = Client(service_url="https://bff.test", transport=t, token="tok")

    # 1. start
    inv = client.start_investigation({"ticket": "ACME-999"})
    assert inv.uri == "investigation://inv_42"

    # 2. stream (chained off the Investigation handle)
    seqs = [e.sequence for e in inv.stream_events()]
    assert seqs == [1, 2, 3]

    # 3. report (chained off the Investigation handle)
    report = inv.get_report(format="json")
    assert report["verdict"] == "CONFIRMED"

    # Branch on the verdict, exactly as the PRD use case describes.
    assert report["verdict"] in {"CONFIRMED", "DECLINED"}
