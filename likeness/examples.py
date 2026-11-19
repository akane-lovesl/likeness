"""The Lookbook's examples: portraits of people who do not exist, each with a few looks and every angle of one of them.

They are made by the studio's own engine, turn by turn, exactly as the app's turns are made: a portrait from words,
each look as an edit of that portrait in the app's own words for it (web/js/looks/vocab.js), and every angle of one
look. They are written where the app reads them: web/examples/<person>/ and web/examples/manifest.json. On the
workstation the engine is Codex with GPT Image; anywhere else the simulator stands in, and the manifest says so.

A run can be stopped and started again: what is already on disk is kept, and only what is missing is made.
"""

from __future__ import annotations

import json
import re
import time
import tomllib
from pathlib import Path

from PIL import Image

from . import paths
from .engines import EngineError, Work
from .jobs import Job
from .store import Store
from .turns import Inputs, Turn

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / "web" / "js" / "looks" / "vocab.js"
CAST = ROOT / "relay" / "0004-lookbook" / "cast.toml"
OUT = ROOT / "web" / "examples"
SIZE = (768, 1024)
KEEP = "Keep everything else exactly as it is: the same person, face, expression, skin, light and background."
ANGLES = ("right", "profile", "left")   # the order the angles brief asks for them in


def vocabulary(path: Path = VOCAB) -> dict[str, dict[str, dict[str, str]]]:
    """The app's own words for every style of every part, read from web/js/looks/vocab.js: one source for both."""
    text = path.read_text(encoding="utf-8")
    parts = re.findall(r"\{ id: '(\w+)', name: '[^']*', masked: (?:true|false), styles: \[(.*?)\] \}", text, re.S)
    return {part: {sid: {"name": name, "words": words} for sid, name, words in re.findall(r"\{ id: '(\w+)', name: '([^']*)', words: '([^']*)'", body)}
            for part, body in parts}


def words_for(words: str) -> str:
    """As the app says it (wordsFor in vocab.js): the change, then that nothing else changes."""
    return f"Give them {words}. {KEEP}"


def load_cast(path: Path = CAST) -> dict:
    cast = tomllib.loads(path.read_text(encoding="utf-8"))
    known = vocabulary()
    for person in cast.get("person", []):
        for part, style in person.get("looks", []):
            if style not in known.get(part, {}):
                raise ValueError(f"{person['id']}: the app has no {part} style called {style!r}")
    return cast


def fit(image: Image.Image, size: tuple[int, int] = SIZE) -> Image.Image:
    """A portrait cut to the app's 3:4, keeping the top of the head: the crop leans upward."""
    w, h = size
    scale = max(w / image.width, h / image.height)
    image = image.convert("RGB").resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    x, y = (image.width - w) // 2, int((image.height - h) * .35)
    return image.crop((x, y, x + w, y + h))


class Maker:
    """Turns through one engine, one at a time, each picture kept in the studio's store and on disk where the app reads it."""

    def __init__(self, engine, out: Path, home: Path | None = None, pace: str = "fine", say=print) -> None:
        self.engine, self.out, self.pace, self.say = engine, out, pace, say
        self.store = Store(home or paths.home())
        self.kind = "simulated" if getattr(engine, "kind", "") == "simulator" else "render"
        self.rows: list[dict] = []

    def turn(self, tid: str, text: str, op: str, n: int = 1, subject: Path | None = None) -> list[Image.Image]:
        handles, pictures = {}, {}
        if subject is not None:
            asset = self.store.add_image(Image.open(subject).convert("RGB"), kind="image")["id"]
            handles, pictures = {"A": asset}, {"A": self.store.path(asset)}
        turn = Turn.model_validate({"id": tid, "text": text, "pace": self.pace, "n": n, "handles": handles,
                                    "intent": {"op": op, "subject": handles.get("A")}})
        job = Job()
        work = Work(job, self.store, self.engine.provenance(turn))
        started = time.monotonic()
        self.engine.turn(turn, Inputs(pictures=pictures, subject="A" if subject is not None else None), work)
        made = [self.store.open(work.results[i]["id"]) for i in sorted(work.results)]
        self.rows.append({"turn": tid, "op": op, "n": n, "made": len(made), "ms": int((time.monotonic() - started) * 1000)})
        self.say(f"  {tid}: {len(made)} of {n} in {self.rows[-1]['ms'] / 1000:.0f} s")
        if len(made) < n:
            raise EngineError(f"{tid}: {len(made)} of {n} pictures came back", "Run it again: what is already made is kept.")
        return made

    def save(self, image: Image.Image, path: Path) -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        fit(image).save(path, "WEBP", quality=84, method=6)
        return path.relative_to(self.out).as_posix()


def make(cast: dict, engine, out: Path = OUT, home: Path | None = None, pace: str = "fine", only: list[str] | None = None,
         fresh: bool = False, say=print) -> dict:
    """Every person in the cast, with their looks and the angles of one of them; the manifest is rewritten after each."""
    words, maker, style = vocabulary(), Maker(engine, out, home, pace, say), cast.get("style", {})
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() and not fresh else {}
    people = {p["id"]: p for p in manifest.get("people", [])}
    for person in cast.get("person", []):
        pid = person["id"]
        if only and pid not in only:
            continue
        say(f"{person.get('name', pid)}")
        folder = out / pid
        portrait = folder / "portrait.webp"
        if fresh or not portrait.exists():
            text = style.get("portrait", "{who}, {backdrop}").format(who=person["who"], backdrop=person.get("backdrop", "a plain grey backdrop"))
            maker.save(maker.turn(f"{pid}-portrait", text, "create")[0], portrait)
        looks = []
        for k, (part, sid) in enumerate(person.get("looks", [])):
            said = words[part][sid]["words"]
            image = folder / f"{part}-{sid}.webp"
            if fresh or not image.exists():
                maker.save(maker.turn(f"{pid}-{part}-{sid}", words_for(said), "edit", subject=portrait)[0], image)
            look = {"part": part, "style": sid, "words": said, "image": image.relative_to(out).as_posix(), "angles": []}
            if k == person.get("angles", 0):
                turned = [folder / f"{part}-{sid}-{a}.webp" for a in ANGLES]
                if fresh or not all(p.exists() for p in turned):
                    for picture, path in zip(maker.turn(f"{pid}-{part}-{sid}-angles", "@A from every angle", "angles", n=3, subject=image), turned):
                        maker.save(picture, path)
                look["angles"] = [p.relative_to(out).as_posix() for p in turned]
            looks.append(look)
        people[pid] = {"id": pid, "name": person.get("name", pid.title()), "portrait": portrait.relative_to(out).as_posix(), "looks": looks}
        order = [p["id"] for p in cast.get("person", [])]
        manifest = {"by": engine.describe().get("label", ""), "kind": maker.kind,
                    "note": "Portraits of people who do not exist, made by the studio's engine for the Lookbook (likeness examples).",
                    "people": sorted(people.values(), key=lambda p: order.index(p["id"]) if p["id"] in order else len(order))}
        out.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"manifest": manifest, "turns": maker.rows}
