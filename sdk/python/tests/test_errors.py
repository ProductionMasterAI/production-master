"""Error mapping mirrors the TS client (402/403/404/409)."""

from __future__ import annotations

import pytest

from production_master import (
    BudgetExhausted,
    Client,
    IdempotencyConflict,
    NotFound,
    ServiceError,
)
from tests.fakes import FakeTransport


def _client(transport):
    return Client(service_url="https://bff.test", transport=transport)


def test_409_maps_to_idempotency_conflict():
    t = FakeTransport().enqueue("POST", "/v1/runs", 409, body={"message": "dup"})
    with pytest.raises(IdempotencyConflict) as exc:
        _client(t).start_investigation({"ticket": "ACME-1"})
    assert exc.value.http_status == 409
    assert exc.value.code == "IDEMPOTENCY_CONFLICT"
    assert "dup" in str(exc.value)


def test_402_maps_to_budget_exhausted():
    t = FakeTransport().enqueue("POST", "/v1/runs", 402, body={"message": "no budget"})
    with pytest.raises(BudgetExhausted) as exc:
        _client(t).start_investigation({"ticket": "ACME-1"})
    assert exc.value.code == "BUDGET_EXHAUSTED"
    assert exc.value.http_status == 402


def test_404_maps_to_not_found():
    t = FakeTransport().enqueue("GET", "/v1/runs/missing/report", 404, body={"message": "nope"})
    with pytest.raises(NotFound) as exc:
        _client(t).get_report("missing")
    assert exc.value.code == "NOT_FOUND"
    assert exc.value.http_status == 404


def test_403_maps_to_not_found_no_enumeration():
    # No-enumeration rule: a forbidden singleton looks like not-found.
    t = FakeTransport().enqueue("GET", "/v1/runs/secret/report", 403, body={"message": "forbidden"})
    with pytest.raises(NotFound) as exc:
        _client(t).get_report("secret")
    assert exc.value.code == "NOT_FOUND"
    assert exc.value.http_status == 404


def test_unknown_status_maps_to_service_error():
    t = FakeTransport().enqueue("POST", "/v1/runs", 500, body={"message": "boom"})
    with pytest.raises(ServiceError) as exc:
        _client(t).start_investigation({"ticket": "ACME-1"})
    assert exc.value.code == "UNKNOWN"
    assert exc.value.http_status == 500
