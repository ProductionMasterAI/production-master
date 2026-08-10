"""Python SDK surface round-trip against the emulated, schema-real BFF (#119).

Drives the real ``Client`` through start_investigation -> get_run -> get_report
-> stream_events against the shared :func:`build_emulated_bff` emulator and
asserts the PARSED ``Investigation`` / run / report / ``Event`` results equal
the emulator's schema-real data.
"""

from __future__ import annotations

from production_master import Client
from tests.fakes import build_emulated_bff


def test_emulated_bff_start_get_report_stream_roundtrip():
    emu = build_emulated_bff()
    client = Client(service_url="https://bff.test", transport=emu.transport, token="tok")

    # start_investigation: POST /v1/runs -> 202 { investigationId }
    inv = client.start_investigation({"ticket": "ACME-1"})
    assert inv.id == emu.investigation_id
    assert inv.uri == f"investigation://{emu.investigation_id}"

    # get_run: the full schema-real detail projection.
    run = client.get_run(emu.investigation_id)
    assert run == emu.run
    assert run["status"] == "completed"
    assert run["costUsd"] == 0.42

    # get_report(format="json"): the parsed RCA body.
    report = client.get_report(emu.investigation_id, format="json")
    assert report == emu.report
    assert report["verdict"] in {"CONFIRMED", "DECLINED"}

    # stream_events: ordered, de-duplicated events matching the emulator page.
    events = list(client.stream_events(emu.investigation_id))
    assert [e.sequence for e in events] == [e["sequence"] for e in emu.events]
    assert [e.event_id for e in events] == [e["eventId"] for e in emu.events]


def test_emulated_bff_via_investigation_handle():
    emu = build_emulated_bff()
    client = Client(service_url="https://bff.test", transport=emu.transport, token="tok")

    inv = client.start_investigation({"ticket": "ACME-2"})
    # Chained off the Investigation handle, exactly as the PRD use case describes.
    report = inv.get_report(format="json")
    assert report["rootCause"].startswith("Null deref")
    seqs = [e.sequence for e in inv.stream_events()]
    assert seqs == [1, 2, 3, 4]
