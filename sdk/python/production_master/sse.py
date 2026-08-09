"""A minimal, dependency-free Server-Sent-Events frame parser.

Mirrors the parsing in the TS ``NodeSseConnector``: SSE frames are separated by
a blank line; within a frame, ``data:`` lines are collected and joined with
``\\n``. ``id:`` lines are ignored here -- the client tracks ``Last-Event-ID``
from the parsed event envelope's ``eventId`` field, matching the TS
``EventStream`` behavior.

This module is pure stdlib so the package has no runtime dependencies.
"""

from __future__ import annotations

from typing import Iterable, Iterator


def parse_sse_bytes(chunks: Iterable[bytes]) -> Iterator[str]:
    """Yield the ``data`` payload of each complete SSE frame from a byte stream.

    Parameters
    ----------
    chunks:
        An iterable of byte chunks (e.g. successive ``read()`` results from an
        HTTP streaming response).

    Yields
    ------
    str
        The joined ``data:`` content for each frame, in arrival order.
    """

    buffer = ""
    for chunk in chunks:
        if not chunk:
            continue
        buffer += chunk.decode("utf-8", errors="replace")
        # Normalize CRLF so frame splitting works regardless of line endings.
        buffer = buffer.replace("\r\n", "\n")
        while "\n\n" in buffer:
            frame, buffer = buffer.split("\n\n", 1)
            payload = _frame_data(frame)
            if payload is not None:
                yield payload
    # Flush a trailing frame that was not terminated by a blank line.
    tail = buffer.replace("\r\n", "\n").strip("\n")
    if tail:
        payload = _frame_data(tail)
        if payload is not None:
            yield payload


def _frame_data(frame: str) -> "str | None":
    data_lines = []
    for line in frame.split("\n"):
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].lstrip())
    if not data_lines:
        return None
    return "\n".join(data_lines)


__all__ = ["parse_sse_bytes"]
