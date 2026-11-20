"""openai: GPT Image through the OpenAI Images API, straight from the studio, with no Codex in between.

The quickest way the studio has to make a picture: one HTTP request per picture, streamed, so the picture can be shown
as it develops (partial images) where the model sends them. The pace chosen in the app picks [openai.pace.*] in
studio.toml (model, quality, how many partial pictures). Rooms, looks and backdrop ideas are asked of a text model
with strict JSON schemas, like the Codex engine's.

The key is read from OPENAI_API_KEY, or from the file [openai].key_file names (keep it under private/). It is sent to
the API and nowhere else: never logged, never written into a job, never returned to the app.
"""

from __future__ import annotations

import base64
import io
import json
import os
import secrets
import socket
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageChops

from .. import brief
from ..rooms import BACKDROPS_SCHEMA, LOOK_SCHEMA, ROOM_SCHEMA
from ..turns import SIZES, BackdropAsk, Inputs, LookAsk, RoomAsk, Turn
from . import EngineError, Work, shaped

PACES = {"quick": "Quick", "fine": "Fine", "deep": "Deep"}
DEFAULT_PACES = {
    "quick": {"model": "gpt-image-2.6-flare", "quality": "low", "partials": 1, "timeout": 120},
    "fine": {"model": "gpt-image-2.6-flare", "quality": "medium", "partials": 2, "timeout": 180},
    "deep": {"model": "gpt-image-2.6-sunburst", "quality": "high", "partials": 2, "timeout": 300},
}
EDIT_OPS = {"edit", "restyle", "reference", "blend", "region", "backdrop", "remove", "vary", "angles"}


def _key(config: dict) -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key and config.get("key_file"):
        path = Path(str(config["key_file"])).expanduser()
        key = path.read_text(encoding="utf-8").strip() if path.is_file() else ""
    return key


def _multipart(fields: list[tuple[str, str]], files: list[tuple[str, str, bytes, str]]) -> tuple[bytes, str]:
    """A multipart/form-data body: plain fields, then files (name, filename, bytes, type)."""
    boundary = "likeness" + secrets.token_hex(12)
    out = io.BytesIO()
    for name, value in fields:
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, filename, data, kind in files:
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {kind}\r\n\r\n'.encode())
        out.write(data)
        out.write(b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def _png(path: Path, size: tuple[int, int] | None = None) -> bytes:
    with Image.open(path) as image:
        image = image.convert("RGB")
        if size and image.size != size:
            image = image.resize(size)
        buf = io.BytesIO()
        image.save(buf, "PNG")
        return buf.getvalue()


def _picture(b64: str) -> Image.Image:
    with Image.open(io.BytesIO(base64.b64decode(b64))) as image:
        image.load()
        return image.convert("RGB")


def _said(error: urllib.error.HTTPError) -> EngineError:
    """The API's refusal, in a sentence the person can act on."""
    try:
        detail = json.loads(error.read().decode("utf-8", "replace")).get("error", {})
    except (ValueError, OSError):
        detail = {}
    message, code = str(detail.get("message") or ""), str(detail.get("code") or detail.get("type") or "")
    if error.code == 401:
        return EngineError("The studio's OpenAI key was not accepted.", "Check OPENAI_API_KEY on the studio's computer.")
    if error.code == 429:
        return EngineError("OpenAI is busy or the key's limit is reached.", "Wait a moment and try again.")
    if "moderation" in code or "safety" in code or "safety" in message.lower():
        return EngineError("The picture was refused by the model's safety checks.", "Try different words, or another photo.")
    return EngineError("GPT Image could not make this picture." + (f" ({message[:160]})" if message else ""), "Try again, perhaps in fewer words.")


class OpenAIImages:
    id = "openai"
    kind = "openai"

    def __init__(self, config: dict | None = None) -> None:
        self.config = dict(config or {})
        self.base = (os.environ.get("OPENAI_BASE_URL") or self.config.get("base_url") or "https://api.openai.com/v1").rstrip("/")
        self.key = _key(self.config)
        if not self.key:
            raise SystemExit("The openai engine needs a key: set OPENAI_API_KEY (or [openai].key_file in private/studio.toml).")

    # ---- what the app is told ----
    def pace(self, name: str) -> dict:
        return {**DEFAULT_PACES.get(name, DEFAULT_PACES["fine"]), **(self.config.get("pace", {}).get(name) or {})}

    def describe(self) -> dict:
        return {"id": self.id, "kind": self.kind, "label": "GPT Image, direct",
                "paces": {name: {k: self.pace(name).get(k, "") for k in ("model", "quality")} for name in PACES}}

    def provenance(self, turn: Turn) -> dict:
        return {"kind": "render", "label": "Render", "detail": f"GPT Image · {PACES.get(turn.pace, turn.pace)} · {self.pace(turn.pace)['model']}"}

    # ---- HTTP ----
    def _open(self, path: str, body: bytes, kind: str, timeout: float):
        request = urllib.request.Request(self.base + path, data=body, method="POST", headers={
            "Authorization": "Bearer " + self.key, "Content-Type": kind, "Accept": "text/event-stream, application/json"})
        try:
            return urllib.request.urlopen(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            raise _said(error) from None
        except (urllib.error.URLError, socket.timeout, TimeoutError) as error:
            raise EngineError("The studio could not reach OpenAI.", "Check the studio computer's internet connection.") from error

    def _stream(self, response, work: Work, index: int, prompt: str, aspect: str | None) -> bool:
        """Reads the server-sent events of one picture: partial pictures as they come, then the picture itself."""
        data: list[str] = []
        made = False
        for raw in response:
            work.check()
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            if line.startswith("data:"):
                data.append(line[5:].strip())
                continue
            if line or not data:
                continue
            event, data = json.loads("\n".join(data)), []
            kind = str(event.get("type", ""))
            if kind.endswith("partial_image") and event.get("b64_json"):
                work.stage("draw")
                work.partial(index, shaped(_picture(event["b64_json"]), aspect))
            elif kind.endswith("completed") and event.get("b64_json"):
                work.stage("finish")
                work.result(index, shaped(_picture(event["b64_json"]), aspect), prompt)
                made = True
            elif event.get("error"):
                raise EngineError("GPT Image stopped partway: " + str(event["error"].get("message", ""))[:160], "Try again.")
        return made

    def _one(self, turn: Turn, inputs: Inputs, work: Work, index: int, prompt: str) -> None:
        pace = self.pace(turn.pace)
        size = SIZES.get(turn.aspect or "", "") or str(self.config.get("size") or "1024x1536")
        common = [("model", str(pace["model"])), ("prompt", prompt), ("size", size), ("quality", str(pace["quality"])),
                  ("output_format", "jpeg"), ("output_compression", "92"), ("stream", "true"), ("partial_images", str(int(pace.get("partials", 0))))]
        subject = inputs.subject or next(iter(inputs.pictures), None)
        if turn.intent.op in EDIT_OPS and subject:
            first = inputs.pictures[subject]
            with Image.open(first) as im:
                base_size = im.size
            files = [("image[]", f"{subject}.png", _png(first), "image/png")]
            files += [("image[]", f"{h}.png", _png(p), "image/png") for h, p in inputs.pictures.items() if h != subject][:7]
            mask = self._mask(inputs, base_size)
            if mask is not None:
                files.append(("mask", "mask.png", mask, "image/png"))
            body, kind = _multipart(common, files)
            path = "/images/edits"
        else:
            body = json.dumps({k: (v if k not in ("stream", "partial_images", "output_compression") else (v == "true" if k == "stream" else int(v))) for k, v in common}).encode()
            kind, path = "application/json", "/images/generations"
        work.stage("plan")
        with self._open(path, body, kind, float(pace.get("timeout", 180))) as response:
            if "text/event-stream" in (response.headers.get("Content-Type") or ""):
                if self._stream(response, work, index, prompt, turn.aspect):
                    return
                raise EngineError("GPT Image finished without a picture.", "Try again.")
            answer = json.loads(response.read().decode("utf-8"))
            work.result(index, shaped(_picture(answer["data"][0]["b64_json"]), turn.aspect), prompt)

    @staticmethod
    def _mask(inputs: Inputs, size: tuple[int, int]) -> bytes | None:
        """The marked regions, as the API wants them: transparent where the picture may change."""
        masks = [m for _, _, m in inputs.pins if m] + ([inputs.subject_mask] if inputs.subject_mask else [])
        if not inputs.pins or not masks:
            return None
        region = Image.new("L", size, 0)
        for path in masks[: len(inputs.pins)]:
            with Image.open(path) as m:
                region = ImageChops.lighter(region, m.convert("L").resize(size))
        out = Image.new("RGBA", size, (0, 0, 0, 255))
        out.putalpha(ImageChops.invert(region))
        buf = io.BytesIO()
        out.save(buf, "PNG")
        return buf.getvalue()

    def turn(self, turn: Turn, inputs: Inputs, work: Work) -> None:
        work.stage("read")
        prompt = brief.direct_brief(turn, inputs)
        work.plan("GPT Image, " + PACES.get(turn.pace, turn.pace).lower() + (f", {turn.n} pictures" if turn.n > 1 else ""), prompt)
        if turn.n == 1:
            self._one(turn, inputs, work, 0, prompt)
        else:
            with ThreadPoolExecutor(max_workers=min(4, turn.n)) as pool:
                for future in [pool.submit(self._one, turn, inputs, work, i, prompt) for i in range(turn.n)]:
                    future.result()
        voice = turn.room.voice if turn.room and turn.room.voice else ["Here it is."]
        work.reply(voice[secrets.randbelow(len(voice))])

    # ---- words only ----
    def _words(self, text: str, schema: dict, picture: Path | None = None) -> dict:
        content: list[dict] = [{"type": "text", "text": text}]
        if picture is not None:
            content.append({"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(_png(picture)).decode()}})
        body = json.dumps({"model": str(self.config.get("text_model") or "gpt-5.4-mini"), "messages": [{"role": "user", "content": content}],
                           "response_format": {"type": "json_schema", "json_schema": {"name": "answer", "strict": True, "schema": schema}}}).encode()
        with self._open("/chat/completions", body, "application/json", 90) as response:
            answer = json.loads(response.read().decode("utf-8"))
        try:
            return json.loads(answer["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise EngineError("The answer came back in a shape the studio could not read.", "Try again.") from error

    def room(self, ask: RoomAsk) -> dict:
        return self._words(brief.room_brief(ask.text, ask.palette), ROOM_SCHEMA)

    def look(self, ask: LookAsk, picture: Path | None) -> dict:
        return self._words(brief.look_brief(ask.text, picture is not None), LOOK_SCHEMA, picture)

    def backdrops(self, ask: BackdropAsk, picture: Path | None) -> list[dict]:
        return self._words(brief.backdrops_brief(ask.text, ask.near, ask.dream, ask.room, picture is not None), BACKDROPS_SCHEMA, picture).get("backdrops") or []
