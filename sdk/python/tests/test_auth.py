"""Device-code flow + secure token cache.

The fake service bodies here are the service's REAL wire format (RFC 8628
snake_case, the ``/oauth/*`` paths of edge-api-v1.yaml). Until #89 they were a
camelCase dialect the service never spoke, so the SDK passed every test here
and could not log in against production.
"""

from __future__ import annotations

import os
import stat

import pytest

from production_master import login
from production_master.auth import (
    DeviceAuthError,
    DeviceCodeAuth,
    load_cached_token,
    logout,
    save_token,
    token_cache_path,
)
from tests.fakes import FakeTransport

DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"


def _device_start(**overrides):
    body = {
        "device_code": "dev-123",
        "user_code": "WXYZ-1234",
        "verification_uri": "https://app.test/device",
        "verification_uri_complete": "https://app.test/device?user_code=WXYZ-1234",
        "interval": 1,
        "expires_in": 600,
    }
    body.update(overrides)
    return body


def _token_wire():
    return {
        "access_token": "access-xyz",
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "read-investigation write-investigation",
    }


def test_device_flow_sends_rfc8628_wire_bodies_and_maps_the_response():
    t = FakeTransport()
    t.enqueue("POST", "/v1/oauth/device", 200, body=_device_start())
    # First poll: pending; second poll: tokens.
    t.enqueue("POST", "/v1/oauth/token", 400, body={"error": "authorization_pending"})
    t.enqueue("POST", "/v1/oauth/token", 200, body=_token_wire())

    auth = DeviceCodeAuth(t, client_id="pm-sdk", now=lambda: 1000.0, sleep=lambda ms: None)
    start = auth.start()
    assert start["userCode"] == "WXYZ-1234"
    assert start["verificationUriComplete"].endswith("user_code=WXYZ-1234")

    tokens = auth.wait_for_tokens()
    assert tokens == {
        "accessToken": "access-xyz",
        "refreshToken": "",
        "expiresAt": 1000 + 3600 * 1000,
        "scopes": ["read-investigation", "write-investigation"],
    }

    assert t.requests_for("POST", "/v1/oauth/device")[0].body == {
        "client_id": "pm-sdk",
        "scope": "read-investigation write-investigation",
    }
    assert t.requests_for("POST", "/v1/oauth/token")[0].body == {
        "grant_type": DEVICE_GRANT,
        "device_code": "dev-123",
        "client_id": "pm-sdk",
    }


def test_slow_down_bumps_interval():
    t = FakeTransport()
    t.enqueue("POST", "/v1/oauth/device", 200, body=_device_start(interval=5))
    auth = DeviceCodeAuth(t, now=lambda: 0.0, sleep=lambda ms: None)
    auth.start()
    t.enqueue("POST", "/v1/oauth/token", 429, body={"error": "slow_down"})
    result = auth.poll()
    assert result["status"] == "slow_down"
    assert result["interval"] == 10


def test_a_camelcase_start_response_is_rejected_not_half_read():
    t = FakeTransport()
    t.enqueue("POST", "/v1/oauth/device", 200, body={"deviceCode": "d", "interval": 1, "expiresIn": 600})
    auth = DeviceCodeAuth(t, now=lambda: 0.0, sleep=lambda ms: None)
    with pytest.raises(DeviceAuthError, match='missing or invalid "device_code"'):
        auth.start()


def test_unknown_poll_error_fails_instead_of_polling_forever():
    t = FakeTransport()
    t.enqueue("POST", "/v1/oauth/device", 200, body=_device_start())
    t.enqueue("POST", "/v1/oauth/token", 400, body={"error": "invalid_request"})
    auth = DeviceCodeAuth(t, now=lambda: 0.0, sleep=lambda ms: None)
    auth.start()
    with pytest.raises(DeviceAuthError, match=r"device token poll failed: 400 \(invalid_request\)"):
        auth.poll()


def test_is_expired_honours_the_skew():
    auth = DeviceCodeAuth(FakeTransport(), now=lambda: 1_000_000.0, sleep=lambda ms: None)
    assert auth.is_expired({"expiresAt": 1_000_000 + 30_000}) is True
    assert auth.is_expired({"expiresAt": 1_000_000 + 10 * 60_000}) is False


def test_login_caches_token_with_0600_perms(monkeypatch):
    t = FakeTransport()
    t.enqueue("POST", "/v1/oauth/device", 200, body=_device_start(user_code="U"))
    t.enqueue("POST", "/v1/oauth/token", 200, body=_token_wire())

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
    assert cached["accessToken"] == "access-xyz"
    assert cached["refreshToken"] == ""


def test_logout_removes_cache():
    save_token({"accessToken": "a", "refreshToken": "", "expiresAt": 1, "scopes": []})
    assert load_cached_token() is not None
    logout()
    assert load_cached_token() is None
    logout()  # idempotent
