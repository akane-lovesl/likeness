"""Studio settings: studio.toml in the repository (the defaults, committed), then private/studio.toml (this machine's
own answers, never committed) on top."""

from __future__ import annotations

import tomllib
from pathlib import Path

from . import paths


def _merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load(home: Path | None = None) -> dict:
    config: dict = {}
    for path in (paths.CONFIG, (home or paths.home()) / "studio.toml"):
        if path.exists():
            config = _merge(config, tomllib.loads(path.read_text(encoding="utf-8")))
    config.setdefault("studio", {}).setdefault("engine", "auto")
    config["studio"].setdefault("workers", 2)
    config.setdefault("codex", {})
    return config
