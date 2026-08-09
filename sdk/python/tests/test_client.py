"""start_investigation + get_report + idempotency-key behavior."""

from __future__ import annotations

import pytest

from production_master import Client
from tests.fakes import FakeTransport


def _client(transport, **kw):
    return Client(service_url="https://bff.test", transport=transport, **kw)


def test_start_investigation_posts_and_returns_investigation():
    t = FakeTransport().enqueue(
        "POST", "/v1/runs", 201, body={"investigationId": "inv_1", "status": "created"}
    )
    client = _client(t, token="tok-abc")

    inv = client.start_investigation({"ticket": "ACME-123", "title": "boom"})

    assert inv.id == "inv_1"
    assert inv.uri == "investigation://inv_1"
    assert inv.status == "created"

    req = t.last_request()
    assert req.method == "POST"
    assert req.path == "/v1/runs"
    assert req.body == {"ticket": "ACME-123", "title": "boom"}
    assert req.headers["Authorization"] == "Bearer tok-abc"
    assert req.headers["Idempotency-Key"].startswith("idem-")


def test_idempotency_key_is_stable_across_identical_calls():
    t = FakeTransport().enqueue(
        "POST", "/v1/runs", 201, body={"investigationId": "inv_1"}
    )
    client = _client(t)

    client.start_investigation({"ticket": "ACME-1"})
    client.start_investigation({"ticket": "ACME-1"})
    client.start_investigation({"ticket": "ACME-2"})

    posts = t.requests_for("POST", "/v1/runs")
    assert len(posts) == 3
    # Same params -> same key (retry-safe); different params -> different key.
    assert posts[0].headers["Idempotency-Key"] == posts[1].headers["Idempotency-Key"]
    assert posts[0].headers["Idempotency-Key"] != posts[2].headers["Idempotency-Key"]


def test_custom_idempotency_key_factory_is_used():
    t = FakeTransport().enqueue("POST", "/v1/runs", 201, body={"investigationId": "x"})
    client = _client(t, idempotency_key_factory=lambda params: "fixed-key")

    client.start_investigation({"ticket": "ACME-1"})

    assert t.last_request().headers["Idempotency-Key"] == "fixed-key"


def test_get_report_json_returns_dict():
    t = FakeTransport().enqueue(
        "GET", "/v1/runs/inv_1/report", 200, body={"verdict": "CONFIRMED"}
    )
    client = _client(t)

    report = client.get_report("inv_1", format="json")

    assert report == {"verdict": "CONFIRMED"}
    assert t.last_request().query == {"format": "json"}


def test_get_report_md_returns_text():
    t = FakeTransport().enqueue(
        "GET", "/v1/runs/inv_1/report", 200, text="# Root Cause\n\nverified."
    )
    client = _client(t)

    report = client.get_report("inv_1", format="md")

    assert report == "# Root Cause\n\nverified."
    assert t.last_request().query == {"format": "md"}


def test_no_authorization_header_when_token_absent():
    t = FakeTransport().enqueue("POST", "/v1/runs", 201, body={"investigationId": "x"})
    client = _client(t)  # no token

    client.start_investigation({"ticket": "ACME-1"})

    assert "Authorization" not in t.last_request().headers


def test_mode_and_budget_pass_through_to_body():
    t = FakeTransport().enqueue(
        "POST", "/v1/runs", 201, body={"investigationId": "inv_9", "status": "created"}
    )
    client = _client(t)

    client.start_investigation(
        {"ticket": "ACME-9", "mode": "deep", "budget": {"maxUsd": 5, "maxIterations": 8}}
    )

    req = t.last_request()
    assert req.body == {
        "ticket": "ACME-9",
        "mode": "deep",
        "budget": {"maxUsd": 5, "maxIterations": 8},
    }


def test_pm_access_token_env_is_used_when_no_token_passed(monkeypatch):
    monkeypatch.setenv("PM_ACCESS_TOKEN", "env-tok")
    t = FakeTransport().enqueue("POST", "/v1/runs", 201, body={"investigationId": "x"})
    client = _client(t)  # no explicit token

    client.start_investigation({"ticket": "ACME-1"})

    assert t.last_request().headers["Authorization"] == "Bearer env-tok"


def test_explicit_token_overrides_pm_access_token_env(monkeypatch):
    monkeypatch.setenv("PM_ACCESS_TOKEN", "env-tok")
    t = FakeTransport().enqueue("POST", "/v1/runs", 201, body={"investigationId": "x"})
    client = _client(t, token="explicit-tok")

    client.start_investigation({"ticket": "ACME-1"})

    assert t.last_request().headers["Authorization"] == "Bearer explicit-tok"
