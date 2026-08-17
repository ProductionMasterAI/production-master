"""HTTP transport seam for the thin client.

Mirrors ``HttpTransport`` / ``HttpRequest`` / ``HttpResponse`` from the TS
``packages/plugin-core/src/service/types.ts`` plus the streaming connector from
``src/stream/node-sse-connector.ts``. Tests inject a fake implementing
:class:`Transport` so the whole SDK is exercisable without a network.

The default :class:`UrllibTransport` is pure stdlib (``urllib.request``) so the
package ships with **no runtime dependencies**.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterator, Mapping, Optional

try:  # Python 3.8+
    from typing import Protocol, runtime_checkable
except ImportError:  # pragma: no cover - 3.9 always has it
    from typing_extensions import Protocol, runtime_checkable  # type: ignore


# The hosted BFF. The canonical vanity host is `api.productionmaster.dev`
# (dev#468) — a subdomain we own, so it cannot be hijacked by whoever
# registers `productionmaster.ai` the way the old default could. It now has a
# DNS record and serves the BFF (verified dev#642), so this points at it
# directly rather than the service's raw Vercel deployment origin. Override
# per-call with `service_url=` or `PM_SERVICE_URL`.
DEFAULT_SERVICE_URL = "https://api.productionmaster.dev"
def resolve_service_url(explicit: Optional[str] = None) -> str:
    """Resolve the BFF origin to talk to.

    Precedence: an explicit ``service_url=`` argument > the ``PM_SERVICE_URL``
    environment variable > :data:`DEFAULT_SERVICE_URL`. ``PM_SERVICE_URL`` is
    the knob every other surface in this repo already reads (each editor's MCP
    registration sets it), so a Python caller running beside the plugin points
    both at a self-hosted service with one variable instead of two mechanisms.
    """

    if explicit is not None:
        return explicit
    return os.environ.get("PM_SERVICE_URL") or DEFAULT_SERVICE_URL


@dataclass
class Request:
    """A single HTTP request. ``query`` values of ``None`` are dropped."""

    method: str
    path: str
    query: Optional[Mapping[str, Any]] = None
    body: Any = None
    headers: Mapping[str, str] = field(default_factory=dict)


@dataclass
class Response:
    """An HTTP response.

    ``body`` holds parsed JSON (``dict``/``list``) when the body parses as JSON;
    ``text`` always holds the raw response text (used for ``format=md`` reports).
    """

    status: int
    body: Any = None
    text: str = ""


@runtime_checkable
class Transport(Protocol):
    """The injectable transport seam.

    Implementations must provide a unary ``request`` and a streaming
    ``open_stream`` that yields the ``data`` payload of each SSE frame.
    """

    def request(self, req: Request) -> Response: ...

    def open_stream(self, req: Request) -> Iterator[str]: ...


def _build_url(base_url: str, path: str, query: Optional[Mapping[str, Any]]) -> str:
    url = base_url.rstrip("/") + "/" + path.lstrip("/")
    if query:
        pairs = [(k, str(v)) for k, v in query.items() if v is not None]
        if pairs:
            url = url + "?" + urllib.parse.urlencode(pairs)
    return url


class UrllibTransport:
    """Default transport backed by ``urllib.request`` (stdlib, no deps)."""

    def __init__(self, base_url: str, timeout: float = 60.0) -> None:
        self.base_url = base_url
        self.timeout = timeout

    def request(self, req: Request) -> Response:
        url = _build_url(self.base_url, req.path, req.query)
        headers = dict(req.headers or {})
        data: Optional[bytes] = None
        if req.body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(req.body).encode("utf-8")
        http_req = urllib.request.Request(url, data=data, method=req.method, headers=headers)
        try:
            with urllib.request.urlopen(http_req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return _to_response(resp.status, raw)
        except urllib.error.HTTPError as exc:  # non-2xx still carries a body
            raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            return _to_response(exc.code, raw)

    def open_stream(self, req: Request) -> Iterator[str]:
        from .sse import parse_sse_bytes

        url = _build_url(self.base_url, req.path, req.query)
        headers = {"Accept": "text/event-stream", **dict(req.headers or {})}
        http_req = urllib.request.Request(url, method=req.method, headers=headers)
        resp = urllib.request.urlopen(http_req, timeout=self.timeout)

        def _chunks() -> Iterator[bytes]:
            try:
                while True:
                    chunk = resp.read(1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                resp.close()

        return parse_sse_bytes(_chunks())


def _to_response(status: int, raw: str) -> Response:
    body: Any = None
    if raw:
        try:
            body = json.loads(raw)
        except ValueError:
            body = None
    return Response(status=status, body=body, text=raw)


__all__ = ["Request", "Response", "Transport", "UrllibTransport"]
