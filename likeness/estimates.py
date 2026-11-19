"""How long things take, per engine, kind of change and pace: the median of the last dozen, or a default."""

from __future__ import annotations

import json
import statistics
import threading
from pathlib import Path

DEFAULTS = {
    "simulator": {"quick": 2600, "fine": 4400, "deep": 7200},
    "codex": {"quick": 35000, "fine": 60000, "deep": 120000},
}
OPS = {"create": 1.0, "edit": 1.0, "restyle": 0.95, "reference": 1.12, "blend": 1.2, "region": 1.05, "backdrop": 1.1, "vary": 1.0, "remove": 0.95, "angles": 1.1}


class Estimates:
    def __init__(self, path: Path, engine: str, defaults: dict | None = None) -> None:
        self.path, self.engine, self._lock = path, engine, threading.Lock()
        self.defaults = defaults or DEFAULTS.get(engine, DEFAULTS["codex"])
        try:
            self.seen: dict[str, list[int]] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.seen = {}

    def _key(self, op: str, pace: str, n: int) -> str:
        return f"{self.engine}:{op}:{pace}:{'n' if n > 1 else '1'}"

    def expect(self, op: str, pace: str, n: int = 1) -> int:
        seen = self.seen.get(self._key(op, pace, n), [])
        if len(seen) >= 2:
            return int(statistics.median(seen))
        return int(self.defaults.get(pace, 60000) * OPS.get(op, 1.0) * (1 + (n - 1) * 0.45))

    def record(self, op: str, pace: str, n: int, ms: float) -> None:
        with self._lock:
            key = self._key(op, pace, n)
            self.seen[key] = (self.seen.get(key, []) + [int(ms)])[-12:]
            try:
                self.path.write_text(json.dumps(self.seen), encoding="utf-8")
            except OSError:
                pass
