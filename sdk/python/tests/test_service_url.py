"""Where the SDK decides which BFF origin to talk to.

The precedence itself is the contract worth pinning: a caller's explicit
argument beats the environment, and the environment beats the built-in default.
The env layer exists because `PM_SERVICE_URL` is what every other surface in
this repo reads, so a self-hosted user sets one variable, not two.
"""

from __future__ import annotations

from production_master import Client
from production_master.transport import DEFAULT_SERVICE_URL, resolve_service_url
from tests.fakes import FakeTransport


def test_default_is_used_when_nothing_is_set(monkeypatch):
    monkeypatch.delenv("PM_SERVICE_URL", raising=False)
    assert resolve_service_url() == DEFAULT_SERVICE_URL


def test_env_var_overrides_the_default(monkeypatch):
    monkeypatch.setenv("PM_SERVICE_URL", "https://bff.internal")
    assert resolve_service_url() == "https://bff.internal"


def test_explicit_argument_beats_the_env_var(monkeypatch):
    monkeypatch.setenv("PM_SERVICE_URL", "https://bff.internal")
    assert resolve_service_url("https://bff.explicit") == "https://bff.explicit"


def test_empty_env_var_falls_back_to_the_default(monkeypatch):
    # An unset variable and a variable set to "" reach the process the same way
    # in most shells; neither should produce a request against "".
    monkeypatch.setenv("PM_SERVICE_URL", "")
    assert resolve_service_url() == DEFAULT_SERVICE_URL


def test_client_reports_the_resolved_origin(monkeypatch):
    monkeypatch.setenv("PM_SERVICE_URL", "https://bff.internal")
    client = Client(transport=FakeTransport(), token="tok")
    assert client.service_url == "https://bff.internal"


def test_default_service_url_resolves_to_a_real_host():
    # Guards the specific defect this default was introduced to fix: the
    # previous value pointed at a domain nobody owned, so the out-of-the-box
    # path leaked bearer tokens to whoever registered it. A hostname check is
    # the most this can assert offline, but it does catch a silent revert.
    assert DEFAULT_SERVICE_URL.startswith("https://")
    assert not DEFAULT_SERVICE_URL.endswith("/")
    assert "productionmaster.ai" not in DEFAULT_SERVICE_URL
