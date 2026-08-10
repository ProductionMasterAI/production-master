"""Make the package importable without an install and isolate the token cache."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture(autouse=True)
def isolated_config_dir(tmp_path, monkeypatch):
    """Point the token cache at a throwaway dir so tests never touch ~/.config."""

    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "config"))
    yield
