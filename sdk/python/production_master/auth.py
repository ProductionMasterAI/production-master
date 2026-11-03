"""Device-code (RFC 8628) authentication for the Python SDK.

Mirrors the TS ``DeviceCodeAuth`` (``packages/plugin-core/src/auth/device-code.ts``):
the same endpoints, the same poll/slow_down semantics, the same provider and
scopes used by the plugin/CLI. The HTTP wire format is RFC 8628 snake_case
(``client_id``, ``scope``, ``device_code``, ``grant_type``; responses
``device_code``/``user_code``/``verification_uri``/``access_token``/
``expires_in``), as defined by the service's OpenAPI spec. Until #89 this
module sent a camelCase dialect the service never accepted. The dicts this
module RETURNS keep their camelCase keys (``deviceCode``, ``accessToken``,
``expiresAt`` ...) — that is the SDK's API, not the wire. Tokens are cached to a file under
``~/.config/production-master/`` with ``0600`` permissions (the directory is
created ``0700``).

Endpoints:

* ``POST /v1/oauth/device``  -- begin the device flow
* ``POST /v1/oauth/token``    -- poll for the access token

The service issues no refresh token (it implements no refresh grant), so a
cached session ends at ``expiresAt`` and the user logs in again.

Clock and sleep are injectable so the flow is deterministic in tests against a
fake transport (no real network, no lockout).
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Callable, Dict, List, Optional, Sequence

from .transport import (
    DEFAULT_SERVICE_URL,
    Request,
    Transport,
    UrllibTransport,
    resolve_service_url,
)
DEFAULT_CLIENT_ID = "production-master-cli"
DEFAULT_SCOPES: Sequence[str] = ("read-investigation", "write-investigation")

_ONE_MIN_MS = 60 * 1000
_DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"


class DeviceAuthError(Exception):
    """Raised when the device-authorization flow fails terminally."""


class DeviceCodeAuth:
    """Drives the RFC 8628 device-authorization grant against the BFF."""

    def __init__(
        self,
        transport: Transport,
        client_id: str = DEFAULT_CLIENT_ID,
        scopes: Sequence[str] = DEFAULT_SCOPES,
        now: Optional[Callable[[], float]] = None,
        sleep: Optional[Callable[[float], None]] = None,
        expiry_skew_ms: int = _ONE_MIN_MS,
    ) -> None:
        self._transport = transport
        self._client_id = client_id
        self._scopes = list(scopes)
        # now() returns epoch milliseconds (matches the TS token expiry units).
        self._now = now or (lambda: time.time() * 1000.0)
        self._sleep = sleep or (lambda ms: time.sleep(ms / 1000.0))
        self._expiry_skew_ms = expiry_skew_ms

        self._device_code: Optional[str] = None
        self._interval = 5  # seconds
        self._device_expires_at = 0.0

    def start(self) -> Dict[str, Any]:
        """Begin the flow; returns the device-start response dict."""

        res = self._transport.request(
            Request(
                method="POST",
                path="/v1/oauth/device",
                body=_device_request(self._client_id, self._scopes),
            )
        )
        if not (200 <= res.status < 300):
            raise DeviceAuthError(f"device start failed: {res.status}{_error_suffix(res.body)}")
        start = _parse_device_response(res.body)
        self._device_code = start["deviceCode"]
        self._interval = max(1, start["interval"])
        self._device_expires_at = self._now() + start["expiresIn"] * 1000
        return start

    def poll(self) -> Dict[str, Any]:
        """One poll tick. Never call faster than ``interval`` seconds yourself."""

        if not self._device_code:
            raise DeviceAuthError("poll() called before start()")
        if self._now() >= self._device_expires_at:
            return {"status": "expired"}

        res = self._transport.request(
            Request(
                method="POST",
                path="/v1/oauth/token",
                body={
                    "grant_type": _DEVICE_CODE_GRANT,
                    "device_code": self._device_code,
                    "client_id": self._client_id,
                },
            )
        )
        if 200 <= res.status < 300:
            return {"status": "tokens", "tokens": _parse_token_response(res.body, self._now(), self._scopes)}
        err = res.body.get("error") if isinstance(res.body, dict) else None
        if err == "authorization_pending":
            return {"status": "pending"}
        if err == "slow_down":
            self._interval += 5
            return {"status": "slow_down", "interval": self._interval}
        if err == "access_denied":
            return {"status": "denied"}
        if err == "expired_token":
            return {"status": "expired"}
        # Anything else is a real failure; treating it as "pending" turned a
        # contract mismatch into a silent poll-until-expiry.
        raise DeviceAuthError(f"device token poll failed: {res.status}{_error_suffix(res.body)}")

    def wait_for_tokens(self) -> Dict[str, Any]:
        """Drive :meth:`poll` to a terminal state, honoring the poll interval."""

        while True:
            self._sleep(self._interval * 1000)
            result = self.poll()
            status = result["status"]
            if status == "tokens":
                return result["tokens"]
            if status in ("pending", "slow_down"):
                continue
            if status == "denied":
                raise DeviceAuthError("device authorization denied")
            if status == "expired":
                raise DeviceAuthError("device code expired")

    def is_expired(self, tokens: Dict[str, Any]) -> bool:
        """True when a session is at (or within the skew of) its expiry."""

        return tokens["expiresAt"] - self._now() <= self._expiry_skew_ms


def _error_suffix(body: Any) -> str:
    err = body.get("error") if isinstance(body, dict) else None
    return f" ({err})" if isinstance(err, str) else ""


def _device_request(client_id: str, scopes: Sequence[str]) -> Dict[str, Any]:
    body: Dict[str, Any] = {"client_id": client_id}
    if scopes:
        body["scope"] = " ".join(scopes)
    return body


def _require(body: Dict[str, Any], key: str, kind: type, what: str) -> Any:
    value = body.get(key)
    if not isinstance(value, kind) or isinstance(value, bool) or value in ("", None):
        raise DeviceAuthError(f'{what}: missing or invalid "{key}"')
    return value


def _parse_device_response(body: Any) -> Dict[str, Any]:
    what = "device start response"
    if not isinstance(body, dict):
        raise DeviceAuthError(f"{what}: expected a JSON object")
    return {
        "deviceCode": _require(body, "device_code", str, what),
        "userCode": _require(body, "user_code", str, what),
        "verificationUri": _require(body, "verification_uri", str, what),
        "verificationUriComplete": _require(body, "verification_uri_complete", str, what),
        "interval": _require(body, "interval", int, what),
        "expiresIn": _require(body, "expires_in", int, what),
    }


def _parse_token_response(body: Any, now_ms: float, requested: Sequence[str]) -> Dict[str, Any]:
    what = "token response"
    if not isinstance(body, dict):
        raise DeviceAuthError(f"{what}: expected a JSON object")
    token_type = _require(body, "token_type", str, what)
    if token_type.lower() != "bearer":
        raise DeviceAuthError(f'{what}: unsupported token_type "{token_type}"')
    scope = body.get("scope")
    return {
        "accessToken": _require(body, "access_token", str, what),
        "refreshToken": "",
        "expiresAt": int(now_ms + _require(body, "expires_in", int, what) * 1000),
        "scopes": scope.split() if isinstance(scope, str) and scope.strip() else list(requested),
    }


# -- token cache (0600, under ~/.config/production-master) ------------------


def config_dir() -> str:
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(
        os.path.expanduser("~"), ".config"
    )
    return os.path.join(base, "production-master")


def token_cache_path() -> str:
    return os.path.join(config_dir(), "token.json")


def save_token(token: Dict[str, Any]) -> str:
    """Persist ``token`` to the secure cache (dir ``0700``, file ``0600``)."""

    directory = config_dir()
    os.makedirs(directory, mode=0o700, exist_ok=True)
    try:
        os.chmod(directory, 0o700)
    except OSError:
        pass
    path = token_cache_path()
    payload = json.dumps(token).encode("utf-8")
    # Create with restrictive perms from the start (avoid a world-readable window).
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, payload)
    finally:
        os.close(fd)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return path


def load_cached_token() -> Optional[Dict[str, Any]]:
    """Return the cached token dict, or ``None`` if absent/unreadable."""

    path = token_cache_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def logout() -> None:
    """Remove the cached token (idempotent)."""

    path = token_cache_path()
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def login(
    service_url: Optional[str] = None,
    transport: Optional[Transport] = None,
    client_id: str = DEFAULT_CLIENT_ID,
    scopes: Sequence[str] = DEFAULT_SCOPES,
    on_prompt: Optional[Callable[[Dict[str, Any]], None]] = None,
    now: Optional[Callable[[], float]] = None,
    sleep: Optional[Callable[[float], None]] = None,
    cache: bool = True,
) -> Dict[str, Any]:
    """Run the device-code flow end-to-end and (by default) cache the token.

    ``on_prompt`` receives the device-start response (``userCode``,
    ``verificationUriComplete``, ...); when omitted, the verification details
    are printed to stdout. Returns the token dict.
    """

    transport = transport or UrllibTransport(resolve_service_url(service_url))
    auth = DeviceCodeAuth(transport, client_id=client_id, scopes=scopes, now=now, sleep=sleep)
    start = auth.start()
    if on_prompt is not None:
        on_prompt(start)
    else:
        uri = start.get("verificationUriComplete") or start.get("verificationUri", "")
        code = start.get("userCode", "")
        print(f"To authenticate, visit: {uri}")
        if code:
            print(f"and enter code: {code}")
    tokens = auth.wait_for_tokens()
    if cache:
        save_token(tokens)
    return tokens


__all__ = [
    "DeviceCodeAuth",
    "DeviceAuthError",
    "login",
    "logout",
    "save_token",
    "load_cached_token",
    "token_cache_path",
    "config_dir",
    "DEFAULT_CLIENT_ID",
    "DEFAULT_SCOPES",
    "DEFAULT_SERVICE_URL",
]
