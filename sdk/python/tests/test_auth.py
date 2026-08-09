"""Device-code flow + secure token cache."""

from __future__ import annotations

import os
import stat

from production_master import login
from production_master.auth import (
    DeviceCodeAuth,
    load_cached_token,
    logout,
    save_token,
    token_cache_path,
)
from tests.fakes import FakeTransport


def _tokens():
    return {
        "accessToken": "access-xyz",
        "refreshToken": "refresh-xyz",
        "expiresAt": 9999999999000,
        "scopes": ["read-investigation", "write-investigation"],
    }


def test_device_flow_start_then_poll_to_tokens():
    t = FakeTransport()
    t.enqueue(
        "POST",
        "/v1/oauth/device",
        200,
        body={
            "deviceCode": "dev-123",
            "userCode": "WXYZ-1234",
            "verificationUri": "https://bff.test/device",
            "verificationUriComplete": "https://bff.test/device?code=WXYZ-1234",
            "interval": 1,
            "expiresIn": 600,
        },
    )
    # First poll: pending; second poll: tokens.
    t.enqueue("POST", "/v1/oauth/token", 400, body={"error": "authorization_pending"})
    t.enqueue("POST", "/v1/oauth/token", 200, body=_tokens())

    auth = DeviceCodeAuth(t, now=lambda: 0.0, sleep=lambda ms: None)
    start = auth.start()
    assert start["userCode"] == "WXYZ-1234"

    tokens = auth.wait_for_tokens()
    assert tokens["accessToken"] == "access-xyz"

    # device-start sent client id + space-joined scopes
    start_req = t.requests_for("POST", "/v1/oauth/device")[0]
    assert start_req.body["scope"] == "read-investigation write-investigation"


def test_slow_down_bumps_interval():
    t = FakeTransport()
    t.enqueue(
        "POST",
        "/v1/oauth/device",
        200,
        body={"deviceCode": "d", "interval": 5, "expiresIn": 600},
    )
    auth = DeviceCodeAuth(t, now=lambda: 0.0, sleep=lambda ms: None)
    auth.start()
    t.enqueue("POST", "/v1/oauth/token", 400, body={"error": "slow_down"})
    result = auth.poll()
    assert result["status"] == "slow_down"
    assert result["interval"] == 10


def test_login_caches_token_with_0600_perms(monkeypatch):
    t = FakeTransport()
    t.enqueue(
        "POST",
        "/v1/oauth/device",
        200,
        body={"deviceCode": "d", "userCode": "U", "interval": 1, "expiresIn": 600},
    )
    t.enqueue("POST", "/v1/oauth/token", 200, body=_tokens())

    prompts = []
    tokens = login(
        transport=t,
        on_prompt=lambda s: prompts.append(s),
        now=lambda: 0.0,
        sleep=lambda ms: None,
    )

    assert tokens["accessToken"] == "access-xyz"
    assert prompts and prompts[0]["userCode"] == "U"

    path = token_cache_path()
    assert os.path.exists(path)
    mode = stat.S_IMODE(os.stat(path).st_mode)
    assert mode == 0o600

    cached = load_cached_token()
    assert cached["refreshToken"] == "refresh-xyz"


def test_logout_removes_cache():
    save_token(_tokens())
    assert load_cached_token() is not None
    logout()
    assert load_cached_token() is None
    logout()  # idempotent
