"""Engines make the pictures. The studio hands each turn to its engine with the pictures on disk and a Work to report
through. The engine says what it is doing as it goes (stages, notes, a plan), hands back each picture the moment it
is ready, and ends with a short reply. Two engines answer the same protocol:

  simulator  paints stand-ins with Pillow, anywhere: for building and testing the whole path, honestly labelled
  codex      Codex CLI makes the pictures with GPT Image, on the workstation
  openai     GPT Image through the OpenAI API directly: the quickest, streamed (needs OPENAI_API_KEY)
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from PIL import Image

from ..jobs import Job
from ..store import Store
from ..turns import BackdropAsk, Inputs, LookAsk, RoomAsk, Turn


class EngineError(RuntimeError):
    """A failure the person reads: the message says what happened, the hint what they might change."""

    def __init__(self, message: str, hint: str = "") -> None:
        super().__init__(message)
        self.hint = hint


def _tidy(text, limit: int) -> str:
    return " ".join(str(text or "").split())[:limit]


class Work:
    """One turn in progress, as the app sees it: every call here becomes an event on the job's stream."""

    def __init__(self, job: Job, store: Store, provenance: dict) -> None:
        self.job, self.store, self.provenance = job, store, provenance
        self.results: dict[int, dict] = {}
        self._stage = ""

    def check(self) -> None:
        self.job.check()

    def stage(self, key: str) -> None:
        if key != self._stage:
            self._stage = key
            self.job.emit("stage", stage=key)

    def note(self, text: str) -> None:
        if text := _tidy(text, 160):
            self.job.emit("note", text=text)

    def plan(self, summary: str, prompt: str = "") -> None:
        self.job.emit("plan", plan={"summary": _tidy(summary, 240), "prompt": str(prompt or "")[:1600]})

    def progress(self, value: float) -> None:
        self.job.emit("progress", value=round(max(0.0, min(1.0, value)), 3))

    def partial(self, index: int, image: Image.Image) -> None:
        if index not in self.results:
            asset = self.store.add_image(image, "partial")
            self.job.emit("partial", index=index, url=self.store.url(asset["id"]))

    def result(self, index: int, image: Image.Image, prompt: str = "") -> None:
        if index in self.results:
            return
        asset = self.store.add_image(image, "made", prompt=str(prompt or "")[:1600], provenance=self.provenance)
        self.results[index] = asset
        self.job.emit("result", index=index, url=self.store.url(asset["id"]), w=asset["w"], h=asset["h"], provenance=self.provenance, prompt=str(prompt or "")[:1600])

    def reply(self, text: str, suggestions: list[str] | None = None) -> None:
        ideas = [_tidy(s, 48) for s in suggestions or [] if _tidy(s, 48)]
        self.job.emit("reply", text=_tidy(text, 320), suggestions=ideas[:3])


def shaped(image: Image.Image, aspect: str | None) -> Image.Image:
    """A picture cut to the format the turn asked for (centred, a little above the middle, where a face is)."""
    if not aspect or aspect == "portrait" and image.height >= image.width * 1.45:
        return image
    ratio = {"square": 1.0, "tall": 16 / 9, "portrait": 1.5}.get(aspect, 0)
    if not ratio:
        return image
    w, h = image.size
    if h / w > ratio:
        ch = int(w * ratio)
        top = max(0, min(h - ch, int((h - ch) * .35)))
        return image.crop((0, top, w, top + ch))
    cw = int(h / ratio)
    left = (w - cw) // 2
    return image.crop((left, 0, left + cw, h))


class Engine(Protocol):
    id: str
    kind: str   # "simulator", "codex" or "openai": decides the edition the app labels itself with

    def describe(self) -> dict: ...
    def provenance(self, turn: Turn) -> dict: ...
    def turn(self, turn: Turn, inputs: Inputs, work: Work) -> None: ...
    def room(self, ask: RoomAsk) -> dict: ...
    def look(self, ask: LookAsk, picture: Path | None) -> dict: ...
    def backdrops(self, ask: BackdropAsk, picture: Path | None) -> list[dict]: ...


def create(name: str = "auto", config: dict | None = None, home: Path | None = None) -> Engine:
    """auto: Codex when its command answers on this machine, otherwise the simulator."""
    from .. import settings

    config = settings.load(home) if config is None else config
    name = (name or config.get("studio", {}).get("engine") or "auto").lower()
    if name == "auto":
        from .codex import version

        name = "codex" if version(list(config.get("codex", {}).get("command") or ["codex"])) else "simulator"
    if name in ("simulator", "mock"):
        from .simulator import Simulator

        return Simulator()
    if name == "codex":
        from .codex import Codex

        return Codex(config.get("codex", {}), home)
    if name == "openai":
        from .openai_images import OpenAIImages

        return OpenAIImages(config.get("openai", {}))
    raise SystemExit(f"There is no engine called {name}: choose auto, simulator, codex or openai.")
