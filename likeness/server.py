"""The studio's front door: the app's files, one turn API that every engine answers, and a stream of events per job.

  GET  /studio.json                 which studio this is; the app labels its edition from it
  POST /api/assets                  a picture or a mask, sent once (multipart: file, kind)
  GET  /api/assets/{id}             a picture back
  POST /api/turns                   a turn: answers {job, eta}
  GET  /api/jobs/{id}/events        what happens, as it happens (server-sent events); GET /api/jobs/{id} for polling
  POST /api/jobs/{id}/cancel        stop it
  POST /api/rooms, /api/looks, /api/backdrops   words from the studio's model, checked before they reach the app
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, engines, paths, settings
from .engines import EngineError, Work
from .estimates import Estimates
from .jobs import Job, Jobs, QueueFull, SubmissionConflict
from .rooms import normalise_backdrops, normalise_look, normalise_room
from .store import MAX_UPLOAD, Store
from .turns import BackdropAsk, Inputs, LookAsk, RoomAsk, Turn

LOOPBACK = {"127.0.0.1", "::1", "localhost"}
NOT_PAIRED = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Likeness</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#121110;color:#ede6da;font:17px/1.5 Georgia,serif">
<p style="max-width:20em;padding:2em">This studio only opens for devices it has paired with.<br><br>Scan the code that <code>likeness serve</code> prints to pair this one.</p>"""
OWNER_OPEN = """<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Likeness Studio</title>
<p id="status" role="status">Opening Likeness Studio...</p>
<script>
const key = location.hash.slice(1);
history.replaceState(null, "", location.pathname);
if (/^[0-9a-f]{64}$/.test(key)) {
  fetch(location.pathname, { method: "POST", headers: { "Content-Type": "text/plain" }, body: key })
    .then(response => { if (!response.ok) throw Error(); location.replace("/"); })
    .catch(() => { document.getElementById("status").textContent = "Could not open the studio. Reopen your access link."; });
} else {
  document.getElementById("status").textContent = "Open Likeness Studio using your access link.";
}
</script>"""
OWNER_HEADERS = {"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
                 "X-Frame-Options": "DENY", "Permissions-Policy": "geolocation=()",
                 "X-Content-Type-Options": "nosniff"}
OWNER_COOKIE = "__Host-likeness"
STATIC_GROUPS = ("css/", "js/", "fonts/", "vendor/", "examples/", "sitters/")


class StudioFiles(StaticFiles):
    """Keep the shell current while the browser reuses the unchanged public assets."""

    def __init__(self, builds: dict[str, str]) -> None:
        super().__init__(directory=paths.WEB)
        self.builds = builds

    def get_path(self, scope):
        path = super().get_path(scope)
        head, sep, tail = path.partition(os.sep)
        if sep and len(head) == 17 and head.startswith("v") and all(c in "0123456789abcdef" for c in head[1:]):
            return tail
        return path

    async def get_response(self, path, scope):
        if not path.replace(os.sep, "/").startswith(STATIC_GROUPS) and path not in {"icon.svg", "manifest.webmanifest"}:
            raise HTTPException(404)
        response = await super().get_response(path, scope)
        supplied = scope["path"].lstrip("/").partition("/")[0]
        if supplied == self.builds.get(path.partition(os.sep)[0]) and response.status_code in (200, 304):
            response.headers["Cache-Control"] = "private, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "private, no-cache"
        return response


def public_build(directory: Path) -> str:
    digest = hashlib.sha256()
    for file in sorted(directory.rglob("*")):
        if file.is_file():
            digest.update(file.relative_to(directory).as_posix().encode())
            digest.update(hashlib.sha256(file.read_bytes()).digest())
    return "v" + digest.hexdigest()[:16]


def owner_link_token(secret: bytes) -> str:
    return hmac.new(secret, b"likeness-owner-open-v1", hashlib.sha256).hexdigest()


def owner_authenticated(header: str, secret: bytes) -> bool:
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() != "basic" or len(encoded) > 256:
        return False
    try:
        credentials = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        return False
    return secrets.compare_digest(credentials, b"likeness:" + secret)


def pairing_key(home: Path) -> str:
    path = home / "pairing.key"
    if not path.exists():
        home.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_urlsafe(9), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


def create_app(engine: engines.Engine | None = None, home: Path | None = None, open_door: bool | None = None, config: dict | None = None) -> FastAPI:
    home = home or paths.home()
    home.mkdir(parents=True, exist_ok=True)
    config = settings.load(home) if config is None else config
    engine = engine or engines.create(os.environ.get("LIKENESS_ENGINE") or config["studio"].get("engine", "auto"), config, home)
    owner_file = os.environ.get("LIKENESS_OWNER_SECRET_FILE")
    link_only = os.environ.get("LIKENESS_OWNER_LINK") == "1"
    if link_only and not owner_file:
        raise ValueError("Passwordless owner access requires a local owner secret file.")
    owner_secret = Path(owner_file).read_bytes().strip() if owner_file else b""
    if owner_file and (not owner_secret.isascii() or not 32 <= len(owner_secret) <= 90):
        raise ValueError("The owner secret must contain 32 to 90 ASCII bytes.")
    link_key = owner_link_token(owner_secret) if link_only else ""
    session_key = hmac.new(owner_secret, b"likeness-owner-session-v2", hashlib.sha256).digest() if link_only else b""
    store = Store(home, isolated=link_only)
    jobs, key = Jobs(int(config["studio"].get("workers", 2))), pairing_key(home)
    estimates = Estimates(home / f"estimates-{engine.kind}.json", engine.kind)
    open_door = bool(os.environ.get("LIKENESS_OPEN")) if open_door is None else open_door
    app = FastAPI(title="Likeness", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.engine, app.state.store, app.state.jobs, app.state.key = engine, store, jobs, key
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=3)
    css = public_build(paths.WEB / "css")
    fonts = public_build(paths.WEB / "fonts")
    style_build = "v" + hashlib.sha256((css + fonts).encode()).hexdigest()[:16]
    builds = {name: public_build(paths.WEB / name) for name in ("js", "vendor", "examples", "sitters")}
    builds.update(css=style_build, fonts=style_build)

    def owner_device(cookie: str) -> str | None:
        device, sep, mac = cookie.partition(".")
        if sep and len(device) == 32 and len(mac) == 64 and device.isascii() and all(c in "0123456789abcdef" for c in device):
            signed = hmac.new(session_key, device.encode("ascii"), hashlib.sha256).hexdigest()
            if secrets.compare_digest(mac.encode("utf-8"), signed.encode("ascii")):
                return device
        return None

    def owner_session(request: Request, response):
        device = owner_device(request.cookies.get(OWNER_COOKIE, "")) or secrets.token_hex(16)
        signed = hmac.new(session_key, device.encode("ascii"), hashlib.sha256).hexdigest()
        response.set_cookie(OWNER_COOKIE, f"{device}.{signed}", max_age=31536000,
                            secure=True, httponly=True, samesite="strict", path="/")
        return response

    def studio_store(request: Request) -> Store:
        device = getattr(request.state, "device", None)
        return Store(home / "devices" / device, isolated=True) if device else store

    @app.middleware("http")
    async def paired(request: Request, call_next):
        """Only this machine, or a device that has scanned the pairing code, may come in."""
        if owner_secret:
            if link_only and request.method == "GET" and request.url.path.startswith("/open/"):
                supplied = request.url.path[len("/open/"):]
                if len(supplied) == 64 and secrets.compare_digest(supplied.encode("utf-8"), link_key.encode("ascii")):
                    return owner_session(request, RedirectResponse("/", status_code=303, headers=OWNER_HEADERS))
                return HTMLResponse("Open your access link again.", status_code=403, headers=OWNER_HEADERS)
            if link_only and request.url.path == "/open":
                if request.method == "GET":
                    return HTMLResponse(OWNER_OPEN, headers=OWNER_HEADERS)
                if request.method == "POST":
                    expected_origin = f"{request.url.scheme}://{request.url.netloc}"
                    if request.headers.get("origin") == expected_origin:
                        async for chunk in request.stream():
                            if len(chunk) == 64 and secrets.compare_digest(chunk, link_key.encode("ascii")):
                                return owner_session(request, HTMLResponse("", status_code=204, headers=OWNER_HEADERS))
                            break
                    return HTMLResponse("Open your access link again.", status_code=403, headers=OWNER_HEADERS)
            if link_only:
                device = owner_device(request.cookies.get(OWNER_COOKIE, ""))
                if not device:
                    return HTMLResponse("Open Likeness Studio using your access link.", status_code=401, headers=OWNER_HEADERS)
                request.state.device = device
            elif not owner_authenticated(request.headers.get("authorization", ""), owner_secret):
                return HTMLResponse("Sign in to Likeness Studio.", status_code=401, headers={
                    "WWW-Authenticate": 'Basic realm="Likeness Studio", charset="UTF-8"', "Cache-Control": "no-store",
                })
            origin = request.headers.get("origin")
            if request.method not in {"GET", "HEAD"} and origin and origin != f"{request.url.scheme}://{request.url.netloc}":
                return HTMLResponse("Open Likeness Studio to make changes.", status_code=403)
            response = await call_next(request)
            cache = response.headers.get("Cache-Control", "")
            response.headers.update(OWNER_HEADERS)
            if cache.startswith("private, max-age=") and not request.url.path.startswith("/api/"):
                response.headers["Cache-Control"] = cache
            return response
        offered = request.query_params.get("pair")
        if offered and secrets.compare_digest(offered.encode("utf-8"), key.encode("utf-8")):
            response = RedirectResponse(str(request.url.remove_query_params("pair")))
            response.set_cookie("likeness_key", key, max_age=31536000, secure=request.url.scheme == "https", httponly=True, samesite="lax")
            return response
        host = request.client.host if request.client else ""
        cookie = request.cookies.get("likeness_key", "").encode("utf-8")
        if not (open_door or host in LOOPBACK or secrets.compare_digest(cookie, key.encode("utf-8"))):
            return HTMLResponse(NOT_PAIRED, status_code=401)
        response = await call_next(request)
        response.headers["Permissions-Policy"] = "geolocation=()"
        if "Cache-Control" not in response.headers:
            response.headers["cache-control"] = "no-cache"
        return response

    @app.exception_handler(EngineError)
    async def engine_failed(request: Request, error: EngineError):
        return JSONResponse({"detail": str(error), "hint": error.hint}, status_code=502)

    def describe(request: Request) -> dict:
        device = getattr(request.state, "device", None)
        return {"ok": True, "edition": "live", "version": __version__, "engine": engine.describe(),
                **({"storage": device} if device else {}),
                "events": "poll" if owner_secret else "stream",
                "eta": {pace: estimates.expect("edit", pace) for pace in ("quick", "fine", "deep")}}

    app.get("/studio.json")(describe)
    app.get("/api/health")(describe)

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    @app.get("/index.html", response_class=HTMLResponse, include_in_schema=False)
    def home_page(request: Request):
        template = (paths.WEB / "index.html").read_text(encoding="utf-8")
        info = json.dumps(describe(request), ensure_ascii=True).replace("<", "\\u003c")
        embedded = f'<script id="studio-state" type="application/json">{info}</script>'
        if os.environ.get("LIKENESS_HIDE_EXAMPLES") != "1":
            catalog = paths.WEB / "examples" / "manifest.json"
            if catalog.is_file():
                catalog_content = catalog.read_text(encoding="utf-8")
                catalog_json = json.loads(catalog_content)
                first = next(iter(catalog_json.get("people", [])), {})
                portrait = first.get("portrait", "")
                if re.fullmatch(r"[a-z0-9-]+/portrait\.webp", portrait):
                    embedded += f'<link rel="preload" as="image" href="/{builds["examples"]}/examples/{portrait}" fetchpriority="high">'
                examples = json.dumps(catalog_json, separators=(",", ":")).replace("<", "\\u003c")
                embedded += f'<script id="example-catalog" type="application/json">{examples}</script>'
            versions = json.dumps(builds, separators=(",", ":"))
            embedded += f'<script id="studio-versions" type="application/json">{versions}</script>'
            for directory in ("css", "fonts", "js"):
                template = template.replace(f'"{directory}/', f'"/{builds[directory]}/{directory}/')
        return HTMLResponse(template.replace("<!-- studio-state -->", embedded, 1),
                            headers={"cache-control": "private, no-store"})
    if os.environ.get("LIKENESS_HIDE_EXAMPLES") == "1":
        @app.get("/examples/manifest.json", include_in_schema=False)
        def no_examples() -> None:
            raise HTTPException(404, headers={"X-Likeness-Examples": "drawn"})

    @app.post("/api/assets")
    async def upload(request: Request, file: UploadFile = File(...), kind: Literal["image", "mask"] = Form("image")):
        data = await file.read(MAX_UPLOAD + 1)
        try:
            note = await run_in_threadpool(studio_store(request).add_bytes, data, kind)
        except ValueError as error:
            raise HTTPException(413 if len(data) > MAX_UPLOAD else 415, str(error)) from None
        return {"id": note["id"], "kind": note["kind"], "w": note["w"], "h": note["h"], "url": store.url(note["id"])}

    @app.get("/api/assets/{asset_id}")
    def asset(request: Request, asset_id: str):
        path = studio_store(request).path(asset_id)
        if path is None or not path.exists():
            raise HTTPException(404, "The studio has no such picture.")
        return FileResponse(path, media_type="image/jpeg" if path.suffix == ".jpg" else "image/png", headers={"cache-control": "private, max-age=31536000, immutable"})

    def inputs_for(turn: Turn, assets: Store) -> Inputs:
        pictures = {a: assets.path(a) for a in turn.asset_ids()}
        if any(path is None or not path.is_file() for path in pictures.values()):
            raise HTTPException(409, "Some pictures need to be sent again.")
        return Inputs(
            pictures={h: pictures[a] for h, a in turn.handles.items()},
            subject=turn.handle_of(turn.intent.subject) if turn.intent.subject else None,
            refs=[(h, r.role) for r in turn.intent.refs if (h := turn.handle_of(r.asset))],
            pins=[(p.n, p.note, pictures.get(p.mask)) for p in turn.pins],
            subject_mask=pictures.get(turn.subject_mask),
        )

    @app.post("/api/turns")
    def turn(body: Turn, request: Request):
        assets = studio_store(request)
        device = getattr(request.state, "device", "")
        inputs = inputs_for(body, assets)
        eta = estimates.expect(body.intent.op, body.pace, body.n)

        def work(job: Job) -> None:
            started = time.monotonic()
            progress = Work(job, assets, engine.provenance(body))
            engine.turn(body, inputs, progress)
            if not progress.results:
                raise EngineError("The studio finished without a picture.", "Try again, perhaps in fewer words.")
            ms = int((time.monotonic() - started) * 1000)
            estimates.record(body.intent.op, body.pace, body.n, ms)
            job.emit("done", ms=ms)

        submission = None
        if owner_secret and body.id:
            wire = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()
            submission = (f"{device}:{body.id}", hashlib.sha256(wire).hexdigest())
        try:
            job = jobs.submit(work, submission, owner=device)
            return {"job": job.id, "eta": eta}
        except SubmissionConflict:
            raise HTTPException(422, "This turn ID was already used for a different request.") from None
        except QueueFull:
            raise HTTPException(429, "The studio is busy. Try again when a turn finishes.", headers={"Retry-After": "10"}) from None

    def find(request: Request, job_id: str) -> Job:
        job = jobs.jobs.get(job_id)
        if job is None or (link_only and job.owner != request.state.device):
            raise HTTPException(404, "The studio has no such job.")
        return job

    @app.get("/api/jobs/{job_id}")
    def job_state(request: Request, job_id: str):
        job = find(request, job_id)
        return {"state": job.state, "events": job.events}

    @app.get("/api/jobs/{job_id}/events")
    async def job_events(request: Request, job_id: str):
        job = find(request, job_id)

        async def stream():
            sent = 0
            while True:
                while sent < len(job.events):
                    event = dict(job.events[sent])
                    sent += 1
                    yield f"event: {event.pop('type')}\ndata: {json.dumps(event)}\n\n"
                if job.finished and sent >= len(job.events):
                    return
                await asyncio.sleep(0.05)

        return StreamingResponse(stream(), media_type="text/event-stream", headers={"cache-control": "no-store", "x-accel-buffering": "no"})

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(request: Request, job_id: str):
        find(request, job_id)
        return {"ok": jobs.cancel(job_id)}

    def picture(request: Request, asset_id: str | None) -> Path | None:
        if not asset_id:
            return None
        path = studio_store(request).path(asset_id)
        if path is None or not path.is_file():
            raise HTTPException(409, "The picture needs to be sent again.")
        return path

    @app.post("/api/rooms")
    def room(ask: RoomAsk):
        return normalise_room(engine.room(ask), ask.text)

    @app.post("/api/looks")
    def look(ask: LookAsk, request: Request):
        return normalise_look(engine.look(ask, picture(request, ask.asset)), ask.text)

    @app.post("/api/backdrops")
    def backdrops(ask: BackdropAsk, request: Request):
        ideas = normalise_backdrops(engine.backdrops(ask, picture(request, ask.asset)))
        if not ideas:
            raise EngineError("No ideas came back this time.", "Try again, or say where you would like to be.")
        return {"backdrops": ideas}

    app.mount("/", StudioFiles(builds), name="web")
    return app
