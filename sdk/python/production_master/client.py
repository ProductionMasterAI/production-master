"""The Production Master thin client.

A thin wrapper over the SAME BFF + Stream Gateway every other surface (web,
plugin, CLI) uses. It holds no business logic: it marshals requests, attaches a
stable ``Idempotency-Key`` on mutations, bridges the SSE stream with
``Last-Event-ID`` resume, and maps errors. No new backend, no LLM/provider SDK.

Endpoints reused (identical to the TS ``ServiceClient``):

* ``POST /v1/runs``                       -- create a run (with ``Idempotency-Key``)
* ``GET  /v1/runs/{id}/report``           -- rendered report (``format=json|md``)
* ``GET  /v1/runs/{id}/events?sinceSeq=`` -- durable replay slice
* ``GET  /v1/runs/{id}/stream``           -- live SSE stream (``Last-Event-ID`` resume)
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.parse
from typing import Any, Callable, Dict, Iterator, Mapping, Optional

from .errors import map_error
from .models import Event, Investigation, to_event
from .transport import (
    DEFAULT_SERVICE_URL,
    Request,
    Transport,
    UrllibTransport,
    resolve_service_url,
)

IdempotencyKeyFactory = Callable[[Mapping[str, Any]], str]


def _stable_idempotency_key(params: Mapping[str, Any]) -> str:
    """A deterministic key derived from the request params.

    Mirrors the issue requirement of "a stable ``Idempotency-Key``": retrying
    ``start_investigation`` with the same params produces the same key, so the
    BFF treats the retry as the same logical mutation rather than a new run.
    """

    canonical = json.dumps(params, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"idem-{digest[:32]}"


# Event types that terminate the stream (matches RunStatus completed/failed).
_TERMINAL_SUFFIXES = (".completed", ".failed")
_TERMINAL_STATUSES = {"completed", "failed"}


def _is_terminal(env: Mapping[str, Any]) -> bool:
    etype = env.get("type", "")
    if isinstance(etype, str) and etype.endswith(_TERMINAL_SUFFIXES):
        return True
    payload = env.get("payload") or {}
    return isinstance(payload, dict) and payload.get("status") in _TERMINAL_STATUSES


def _ok(status: int) -> bool:
    return 200 <= status < 300


def _q(value: str) -> str:
    return urllib.parse.quote(value, safe="")


class Client:
    """Entry point for the SDK.

    Parameters
    ----------
    service_url:
        Base URL of the BFF (default :data:`DEFAULT_SERVICE_URL`).
    token:
        Bearer token. When omitted, the token is resolved headless-first: the
        ``PM_ACCESS_TOKEN`` environment variable (for CI / machine tokens), then
        a cached device-code token from ``~/.config/production-master/`` if
        present (see :mod:`production_master.auth`).
    idempotency_key_factory:
        Override how the ``Idempotency-Key`` is derived from request params.
        Defaults to a stable sha256 of the params.
    transport:
        Inject a fake :class:`~production_master.transport.Transport` in tests.
        Defaults to :class:`~production_master.transport.UrllibTransport`.
    """

    def __init__(
        self,
        service_url: Optional[str] = None,
        token: Optional[str] = None,
        idempotency_key_factory: Optional[IdempotencyKeyFactory] = None,
        transport: Optional[Transport] = None,
        max_reconnects: int = 10,
    ) -> None:
        self.service_url = resolve_service_url(service_url)
        self._transport: Transport = transport or UrllibTransport(self.service_url)
        self._idem_factory = idempotency_key_factory or _stable_idempotency_key
        self._max_reconnects = max_reconnects
        self._token = token if token is not None else _resolve_token()

    # -- helpers -----------------------------------------------------------

    def _headers(self, extra: Optional[Mapping[str, str]] = None) -> Dict[str, str]:
        headers: Dict[str, str] = dict(extra or {})
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    # -- public API --------------------------------------------------------

    def start_investigation(self, params: Mapping[str, Any]) -> Investigation:
        """Create a run via ``POST /v1/runs`` and return an :class:`Investigation`.

        ``params`` is the ``CreateRunRequest`` body, e.g.
        ``{"ticket": "ACME-123", "title": "..."}``. Optional depth/budget
        controls pass straight through to the BFF:
        ``{"mode": "deep", "budget": {"maxUsd": 5, "maxIterations": 8}}``.
        """

        params = dict(params)
        idem_key = self._idem_factory(params)
        res = self._transport.request(
            Request(
                method="POST",
                path="/v1/runs",
                body=params,
                headers=self._headers({"Idempotency-Key": idem_key}),
            )
        )
        if not _ok(res.status):
            raise map_error(res.status, res.body, res.text, "start_investigation")
        run = res.body if isinstance(res.body, dict) else {}
        investigation_id = run.get("investigationId", "")
        return Investigation(self, investigation_id, run)

    def get_run(self, investigation_id: str) -> Dict[str, Any]:
        """Fetch run status via ``GET /v1/runs/{id}``."""

        res = self._transport.request(
            Request(
                method="GET",
                path=f"/v1/runs/{_q(investigation_id)}",
                headers=self._headers(),
            )
        )
        if not _ok(res.status):
            raise map_error(res.status, res.body, res.text, "get_run")
        return res.body if isinstance(res.body, dict) else {}

    def get_report(self, investigation_id: str, format: str = "json") -> Any:
        """Fetch the rendered report via ``GET /v1/runs/{id}/report``.

        ``format="json"`` returns the parsed report ``dict``; ``format="md"``
        returns the raw markdown ``str``.
        """

        res = self._transport.request(
            Request(
                method="GET",
                path=f"/v1/runs/{_q(investigation_id)}/report",
                query={"format": format},
                headers=self._headers(),
            )
        )
        if not _ok(res.status):
            raise map_error(res.status, res.body, res.text, "get_report")
        if format == "md":
            if res.text:
                return res.text
            return res.body if isinstance(res.body, str) else ""
        return res.body

    def stream_events(
        self,
        investigation_id: str,
        since_seq: Optional[int] = None,
        last_event_id: Optional[str] = None,
        max_reconnects: Optional[int] = None,
    ) -> Iterator[Event]:
        """Yield ordered, de-duplicated events for an investigation.

        Bridges the SSE stream (``GET /v1/runs/{id}/stream``) and reconnects with
        the ``Last-Event-ID`` header so the service replays ``sequence > lastSeq``
        -- matching the TS ``EventStream``. Pass ``since_seq`` to first replay the
        durable slice via ``GET /v1/runs/{id}/events`` before attaching the live
        stream, or ``last_event_id`` to resume from a known event id.

        The generator returns when it sees a terminal event
        (``*.completed`` / ``*.failed``) or when a reconnect yields no new events.
        """

        seen: set = set()
        cur_last_id = last_event_id
        limit = self._max_reconnects if max_reconnects is None else max_reconnects

        # Optional durable replay first.
        if since_seq is not None:
            slice_res = self._transport.request(
                Request(
                    method="GET",
                    path=f"/v1/runs/{_q(investigation_id)}/events",
                    query={"sinceSeq": since_seq},
                    headers=self._headers(),
                )
            )
            if _ok(slice_res.status):
                body = slice_res.body if isinstance(slice_res.body, dict) else {}
                events = body.get("events") or []
                for env in sorted(events, key=lambda e: e.get("sequence", 0)):
                    ev = self._accept(env, seen)
                    if ev is not None:
                        cur_last_id = ev.event_id
                        yield ev

        reconnects = 0
        while True:
            headers = self._headers()
            if cur_last_id:
                headers["Last-Event-ID"] = cur_last_id
            stream = self._transport.open_stream(
                Request(
                    method="GET",
                    path=f"/v1/runs/{_q(investigation_id)}/stream",
                    headers=headers,
                )
            )
            produced = False
            terminal = False
            for raw in stream:
                env = _parse_envelope(raw)
                if env is None:
                    continue
                ev = self._accept(env, seen)
                if ev is None:
                    continue
                produced = True
                cur_last_id = ev.event_id
                yield ev
                if _is_terminal(env):
                    terminal = True
                    break

            if terminal:
                return
            if not produced:
                # A reconnect that delivered nothing new means the stream is done.
                return
            reconnects += 1
            if reconnects >= limit:
                return

    @staticmethod
    def _accept(env: Mapping[str, Any], seen: set) -> Optional[Event]:
        """Validate + dedupe an envelope; return an :class:`Event` or ``None``."""

        event_id = env.get("eventId")
        sequence = env.get("sequence")
        if not isinstance(event_id, str) or not isinstance(sequence, int):
            return None
        if event_id in seen:
            return None
        seen.add(event_id)
        return to_event(dict(env))


def _parse_envelope(raw: str) -> Optional[Dict[str, Any]]:
    try:
        env = json.loads(raw)
    except ValueError:
        return None
    return env if isinstance(env, dict) else None


def _resolve_token() -> Optional[str]:
    """Resolve a bearer token headless-first (never raises).

    Precedence: ``PM_ACCESS_TOKEN`` env (CI / machine tokens) > cached
    device-code token. An explicit ``token=`` passed to :class:`Client` takes
    precedence over both and bypasses this resolver.
    """

    env_token = os.environ.get("PM_ACCESS_TOKEN")
    if env_token:
        return env_token
    return _load_token_quietly()


def _load_token_quietly() -> Optional[str]:
    """Best-effort load of a cached device-code access token (never raises)."""

    try:
        from .auth import load_cached_token

        cached = load_cached_token()
        if cached:
            token = cached.get("accessToken")
            return token if isinstance(token, str) else None
    except Exception:
        return None
    return None


__all__ = ["Client", "DEFAULT_SERVICE_URL"]
