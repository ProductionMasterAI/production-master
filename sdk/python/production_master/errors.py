"""Typed errors for the Production Master thin client.

Mirrors the TypeScript client's error mapping (``packages/plugin-core/src/service``):

* 409 -> :class:`IdempotencyConflict`
* 402 -> :class:`BudgetExhausted`
* 404 -> :class:`NotFound`
* 403 -> :class:`NotFound` (no-enumeration rule: a forbidden singleton is
  indistinguishable from not-found to the client, so 403 is translated to 404)
* anything else non-2xx -> :class:`ServiceError` with code ``"UNKNOWN"``
"""

from __future__ import annotations

from typing import Any, Optional


class ServiceError(Exception):
    """Raised for any non-2xx service response.

    Attributes
    ----------
    code:
        A stable error code (``NOT_FOUND``, ``IDEMPOTENCY_CONFLICT``,
        ``BUDGET_EXHAUSTED`` or ``UNKNOWN``).
    http_status:
        The HTTP status returned by the service.
    """

    def __init__(self, code: str, http_status: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.http_status = http_status
        self.message = message


class IdempotencyConflict(ServiceError):
    """409 -- a request reused an ``Idempotency-Key`` already seen by the service."""

    def __init__(self, message: str = "Idempotency key already used") -> None:
        super().__init__("IDEMPOTENCY_CONFLICT", 409, message)


class BudgetExhausted(ServiceError):
    """402 -- the account's investigation budget is exhausted."""

    def __init__(self, message: str = "Budget exhausted") -> None:
        super().__init__("BUDGET_EXHAUSTED", 402, message)


class NotFound(ServiceError):
    """404 (and 403, per the no-enumeration rule) -- resource not found."""

    def __init__(self, message: str = "Not found") -> None:
        super().__init__("NOT_FOUND", 404, message)


def _error_message(body: Any, text: str, status: int, context: str) -> str:
    if isinstance(body, dict) and isinstance(body.get("message"), str) and body["message"]:
        return body["message"]
    if text:
        return text
    return f"{context} failed ({status})"


def map_error(status: int, body: Any, text: str, context: str) -> ServiceError:
    """Translate a non-2xx response into the matching typed error.

    The mapping is identical to ``ServiceClient.mapError`` in the TS client so
    the two SDKs surface the same exceptions for the same status codes.
    """

    message = _error_message(body, text, status, context)
    if status == 409:
        return IdempotencyConflict(message)
    if status == 404:
        return NotFound(message)
    if status == 403:
        # No-enumeration rule: a forbidden singleton is indistinguishable from
        # not-found to the client. Translate 403 -> NOT_FOUND.
        return NotFound(message)
    if status == 402:
        return BudgetExhausted(message)
    return ServiceError("UNKNOWN", status, message)


__all__ = [
    "ServiceError",
    "IdempotencyConflict",
    "BudgetExhausted",
    "NotFound",
    "map_error",
]
