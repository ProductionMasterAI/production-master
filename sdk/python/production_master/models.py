"""Lightweight value objects: :class:`Event` and :class:`Investigation`.

These mirror the projections the TS client exposes:

* ``Event`` wraps an ``investigation.events.v1`` envelope
  (``packages/plugin-core/src/types.ts`` ``InvestigationEventEnvelope``).
* ``Investigation`` is the handle returned by ``start_investigation`` -- it
  exposes ``.id`` and the ``investigation://<id>`` URI and chains directly into
  ``.stream_events()`` and ``.get_report()``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, Optional


@dataclass(frozen=True)
class Event:
    """A single ordered, de-duplicated investigation event."""

    event_id: str
    investigation_id: str
    type: str
    sequence: int
    timestamp: Optional[str]
    payload: Dict[str, Any]
    raw: Dict[str, Any]

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.raw.get(key, default)


def to_event(env: Dict[str, Any]) -> Event:
    """Build an :class:`Event` from a raw envelope dict."""

    return Event(
        event_id=env["eventId"],
        investigation_id=env.get("investigationId", ""),
        type=env.get("type", ""),
        sequence=int(env["sequence"]),
        timestamp=env.get("timestamp"),
        payload=env.get("payload") or {},
        raw=env,
    )


@dataclass
class Investigation:
    """A handle to a started investigation.

    ``_client`` is the owning :class:`~production_master.client.Client`; the
    chained ``stream_events`` / ``get_report`` methods delegate to it so callers
    can write ``client.start_investigation(p).stream_events()``.
    """

    _client: Any
    id: str
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def uri(self) -> str:
        return f"investigation://{self.id}"

    @property
    def status(self) -> Optional[str]:
        return self.raw.get("status")

    def stream_events(self, **kwargs: Any) -> Iterator[Event]:
        return self._client.stream_events(self.id, **kwargs)

    def get_report(self, format: str = "json") -> Any:
        return self._client.get_report(self.id, format=format)


__all__ = ["Event", "Investigation", "to_event"]
