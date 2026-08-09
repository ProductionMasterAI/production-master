#!/usr/bin/env python3
"""Basic investigation example — start -> stream -> report quickstart.

Run against a real BFF:
    PM_ACCESS_TOKEN=<token> python3 basic_investigation.py

Offline dry-run (no network, CI-safe) — proves request marshalling without
calling the BFF:
    PM_DRY_RUN=1 PM_ACCESS_TOKEN=dev python3 basic_investigation.py

The SDK is pure stdlib and ships no third-party dependencies. Auth is headless:
the bearer token resolves as explicit ``token=`` > ``PM_ACCESS_TOKEN`` env >
cached device-code token.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Iterator, List

from production_master import Client
from production_master.transport import Request, Response


class _RecordingTransport:
    """Offline transport: records the request and replays a canned 201 + stream.

    Lets the example exercise the real Client marshalling (body, headers,
    Idempotency-Key) and the streaming/report path with no network, so CI can
    run it deterministically.
    """

    def __init__(self) -> None:
        self.requests: List[Request] = []

    def request(self, req: Request) -> Response:
        self.requests.append(req)
        if req.path.endswith("/report"):
            return Response(
                status=200,
                body={"verdict": "CONFIRMED", "summary": "Root cause identified."},
            )
        return Response(
            status=201,
            body={"investigationId": "inv_dryrun", "status": "created"},
        )

    def open_stream(self, req: Request) -> Iterator[str]:
        yield '{"eventId":"01J","investigationId":"inv_dryrun","type":"investigation.started","sequence":1}'
        yield '{"eventId":"02J","investigationId":"inv_dryrun","type":"investigation.completed","sequence":2,"payload":{"status":"completed"}}'


def _client() -> Client:
    dry_run = os.environ.get("PM_DRY_RUN") == "1"
    if dry_run:
        return Client(
            service_url="https://bff.dry-run.local",
            token=os.environ.get("PM_ACCESS_TOKEN", "dry-run-token"),
            transport=_RecordingTransport(),
        )
    return Client(service_url=os.environ.get("PM_SERVICE_URL", ""))


def main(argv: List[str]) -> int:
    ticket = argv[1] if len(argv) > 1 else "ACME-123"
    client = _client()

    # 1. Start a run (POST /v1/runs with a stable Idempotency-Key).
    params: dict[str, Any] = {
        "ticket": ticket,
        "title": "OOM in payments-service",
        "mode": "deep",
        "context": {"service": "payments"},
    }
    inv = client.start_investigation(params)
    print(f"started {inv.uri} ({inv.status})")

    # 2. Stream events live (SSE with Last-Event-ID resume).
    for event in inv.stream_events():
        print(f"  [{event.sequence}] {event.type}")

    # 3. Fetch the rendered report and branch on the verdict.
    report = inv.get_report(format="json")
    verdict = report.get("verdict") if isinstance(report, dict) else None
    summary = report.get("summary") if isinstance(report, dict) else None
    print(f"report verdict={verdict}: {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
