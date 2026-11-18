"""Where things live. Everything personal stays under one git-ignored folder."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
RELAY = ROOT / "relay"
CONFIG = ROOT / "studio.toml"


def home() -> Path:
    """The private folder: your pictures, the studio's renders, job folders, the pairing key. Never committed."""
    path = Path(os.environ.get("LIKENESS_HOME") or ROOT / "private")
    path.mkdir(parents=True, exist_ok=True)
    return path
