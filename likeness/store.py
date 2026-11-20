"""The studio's pictures on disk: everything the phone uploads and everything the studio makes, one file per asset,
with a small JSON note beside it. Lives under the private folder, which git ignores."""

from __future__ import annotations

import io
import json
import re
import secrets
import time
from pathlib import Path

from PIL import Image, ImageOps

MAX_UPLOAD = 24 * 2**20
KINDS = ("image", "mask", "made", "partial")
ASSET_ID = re.compile(r"[0-9a-f]{16}(?:[0-9a-f]{16})?")


class Store:
    def __init__(self, home: Path, *, isolated: bool = False) -> None:
        self.dir = home / "assets"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.isolated = isolated

    def _note(self, asset_id: str) -> Path:
        return self.dir / f"{asset_id}.json"

    def add_bytes(self, data: bytes, kind: str = "image") -> dict:
        """An upload: opened, turned upright, normalised (masks to greyscale PNG, pictures to RGB), saved."""
        if len(data) > MAX_UPLOAD:
            raise ValueError("That picture is larger than the studio accepts (24 MB).")
        try:
            image = Image.open(io.BytesIO(data))
            image.load()
        except Exception as error:
            raise ValueError("That file could not be opened as a picture.") from error
        return self.add_image(ImageOps.exif_transpose(image), kind)

    def add_image(self, image: Image.Image, kind: str = "made", **extra) -> dict:
        if kind not in KINDS:
            raise ValueError(f"Unknown kind of asset: {kind}")
        asset_id = secrets.token_hex(16 if self.isolated else 8)
        if kind == "mask":
            image = image.convert("LA").getchannel("A") if image.mode in ("LA", "RGBA", "PA") else image.convert("L")
            name, fmt = f"{asset_id}.png", "PNG"
        elif kind == "partial":
            image = image.convert("RGB")
            name, fmt = f"{asset_id}.jpg", "JPEG"
        else:
            image = image.convert("RGB")
            name, fmt = f"{asset_id}.png", "PNG"
        image.save(self.dir / name, fmt, **({"quality": 82} if fmt == "JPEG" else {"optimize": False}))
        note = {"id": asset_id, "file": name, "kind": kind, "w": image.width, "h": image.height, "created": time.time(), **extra}
        self._note(asset_id).write_text(json.dumps(note), encoding="utf-8")
        return note

    def get(self, asset_id: str) -> dict | None:
        if not asset_id or not ASSET_ID.fullmatch(asset_id):
            return None
        path = self._note(asset_id)
        if path.resolve().parent != self.dir.resolve():
            return None
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    def path(self, asset_id: str) -> Path | None:
        note = self.get(asset_id)
        if not note or note.get("file") not in (f"{asset_id}.png", f"{asset_id}.jpg"):
            return None
        path = self.dir / note["file"]
        return path if path.resolve().parent == self.dir.resolve() else None

    def open(self, asset_id: str) -> Image.Image:
        path = self.path(asset_id)
        if path is None:
            raise KeyError(asset_id)
        with Image.open(path) as image:
            image.load()
            return image.copy()

    def made(self, limit: int = 120) -> list[dict]:
        """What the studio painted here, newest first: each picture's address, size, when, and the words it was made from."""
        notes = []
        for path in self.dir.glob("*.json"):
            try:
                note = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if note.get("kind") == "made":
                notes.append(note)
        notes.sort(key=lambda n: n.get("created", 0), reverse=True)
        return [{"id": n["id"], "url": self.url(n["id"]), "w": n.get("w"), "h": n.get("h"), "created": n.get("created", 0),
                 "prompt": str(n.get("prompt", ""))[:1600], "provenance": n.get("provenance", {})} for n in notes[:limit]]

    @staticmethod
    def url(asset_id: str) -> str:
        return f"api/assets/{asset_id}"
