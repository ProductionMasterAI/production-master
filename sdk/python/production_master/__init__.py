"""Production Master Python SDK.

A thin client over the same BFF + Stream Gateway as every other surface (web,
plugin, CLI). It is a thin renderer/streamer only -- no new backend, no
LLM/provider SDK.

Quickstart::

    from production_master import Client

    client = Client(token="...")
    inv = client.start_investigation({"ticket": "ACME-123"})
    for event in inv.stream_events():
        print(event.sequence, event.type)
    report = inv.get_report(format="json")
"""

from __future__ import annotations

from .auth import DeviceCodeAuth, login, logout
from .client import Client, DEFAULT_SERVICE_URL
from .errors import (
    BudgetExhausted,
    IdempotencyConflict,
    NotFound,
    ServiceError,
)
from .models import Event, Investigation
from .projection import project
from .transport import Request, Response, Transport, UrllibTransport

__version__ = "0.1.0"

__all__ = [
    "Client",
    "Investigation",
    "Event",
    "ServiceError",
    "IdempotencyConflict",
    "BudgetExhausted",
    "NotFound",
    "Transport",
    "UrllibTransport",
    "Request",
    "Response",
    "DeviceCodeAuth",
    "login",
    "logout",
    "project",
    "DEFAULT_SERVICE_URL",
    "__version__",
]
