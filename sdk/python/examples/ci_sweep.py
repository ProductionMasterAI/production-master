#!/usr/bin/env python3
"""CI sweep — batch-start one investigation per ticket in headless mode.

Reads tickets from argv (or uses defaults) and starts one investigation per
ticket. Designed for CI / cron jobs where ``PM_ACCESS_TOKEN`` is injected as a
secret and no browser interaction is possible.

Run offline (no network, proves request marshalling):
    PM_DRY_RUN=1 PM_ACCESS_TOKEN=ci-token python3 ci_sweep.py ACME-1 ACME-2

Run against a real BFF:
    PM_ACCESS_TOKEN=<machine-token> python3 ci_sweep.py ACME-1 ACME-2
"""

from __future__ import annotations

import os
import sys
from typing import Iterator, List

from production_master import Client, ServiceError
from production_master.transport import Request, Response

_DEFAULT_TICKETS = ["ACME-1", "ACME-2"]


class _RecordingTransport:
    """Offline transport: records requests and replays a canned 201.

    Exercises the real Client marshalling (body, headers, Idempotency-Key)
    with no network, so CI can run the sweep deterministically.
    """

    def __init__(self) -> None:
        self.requests: List[Request] = []

    def request(self, req: Request) -> Response:
        self.requests.append(req)
        return Response(
            status=201,
            body={"investigationId": "inv_dryrun", "status": "created"},
        )

    def open_stream(self, req: Request) -> Iterator[str]:  # pragma: no cover
        return iter(())


def _client() -> Client:
    if os.environ.get("PM_DRY_RUN") == "1":
        return Client(
            service_url="https://bff.dry-run.local",
            token=os.environ.get("PM_ACCESS_TOKEN", "dry-run-token"),
            transport=_RecordingTransport(),
        )
    return Client(service_url=os.environ.get("PM_SERVICE_URL", ""))


def sweep(tickets: List[str]) -> int:
    client = _client()
    failures = 0
    for ticket in tickets:
        params = {
            "ticket": ticket,
            "title": f"CI sweep: {ticket}",
            "mode": "standard",
            "context": {"source": "ci-sweep"},
        }
        try:
            inv = client.start_investigation(params)
            print(f"[ok] started {inv.id} for {ticket}")
        except ServiceError as exc:
            print(
                f"[error] {ticket}: HTTP {exc.http_status} — {exc.message}",
                file=sys.stderr,
            )
            failures += 1
    return failures


def main(argv: List[str]) -> int:
    tickets = argv[1:] if len(argv) > 1 else _DEFAULT_TICKETS
    print(f"Sweeping {len(tickets)} ticket(s): {', '.join(tickets)}")
    failures = sweep(tickets)
    if failures:
        print(f"\n{failures} investigation(s) failed to start.", file=sys.stderr)
        return 1
    print("\nAll investigations started successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
