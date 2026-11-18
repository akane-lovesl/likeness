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
import json
import os
import secrets
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, engines, paths, settings
from .engines import EngineError, Work
from .estimates import Estimates
from .jobs import Job, Jobs
from .rooms import normalise_backdrops, normalise_look, normalise_room
from .store import MAX_UPLOAD, Store
from .turns import BackdropAsk, Inputs, LookAsk, RoomAsk, Turn

LOOPBACK = {"127.0.0.1", "::1", "localhost"}
NOT_PAIRED = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Likeness</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#121110;color:#ede6da;font:17px/1.5 Georgia,serif">
<p style="max-width:20em;padding:2em">This studio only opens for devices it has paired with.<br><br>Scan the code that <code>likeness serve</code> prints to pair this one.</p>"""


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
    store, jobs, key = Store(home), Jobs(int(config["studio"].get("workers", 2))), pairing_key(home)
    estimates = Estimates(home / f"estimates-{engine.kind}.json", engine.kind)
    open_door = bool(os.environ.get("LIKENESS_OPEN")) if open_door is None else open_door
    app = FastAPI(title="Likeness", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.engine, app.state.store, app.state.jobs, app.state.key = engine, store, jobs, key

    @app.middleware("http")
    async def paired(request: Request, call_next):
        """Only this machine, or a device that has scanned the pairing code, may come in."""
        offered = request.query_params.get("pair")
        if offered and secrets.compare_digest(offered, key):
            response = RedirectResponse(str(request.url.remove_query_params("pair")))
            response.set_cookie("likeness_key", key, max_age=31536000, httponly=True, samesite="lax")
            return response
        host = request.client.host if request.client else ""
        if not (open_door or host in LOOPBACK or secrets.compare_digest(request.cookies.get("likeness_key", ""), key)):
            return HTMLResponse(NOT_PAIRED, status_code=401)
        response = await call_next(request)
        if not request.url.path.startswith("/api/assets/"):
            response.headers["cache-control"] = "no-cache"
        return response

    @app.exception_handler(EngineError)
    async def engine_failed(request: Request, error: EngineError):
        return JSONResponse({"detail": str(error), "hint": error.hint}, status_code=502)

    def describe() -> dict:
        return {"ok": True, "edition": "live", "version": __version__, "engine": engine.describe(),
                "eta": {pace: estimates.expect("edit", pace) for pace in ("quick", "fine", "deep")}}

    app.get("/studio.json")(describe)
    app.get("/api/health")(describe)

    @app.post("/api/assets")
    async def upload(file: UploadFile = File(...), kind: Literal["image", "mask"] = Form("image")):
        data = await file.read(MAX_UPLOAD + 1)
        try:
            note = await run_in_threadpool(store.add_bytes, data, kind)
        except ValueError as error:
            raise HTTPException(413 if len(data) > MAX_UPLOAD else 415, str(error)) from None
        return {"id": note["id"], "kind": note["kind"], "w": note["w"], "h": note["h"], "url": store.url(note["id"])}

    @app.get("/api/assets/{asset_id}")
    def asset(asset_id: str):
        path = store.path(asset_id)
        if path is None or not path.exists():
            raise HTTPException(404, "The studio has no such picture.")
        return FileResponse(path, media_type="image/jpeg" if path.suffix == ".jpg" else "image/png", headers={"cache-control": "private, max-age=31536000, immutable"})

    def inputs_for(turn: Turn) -> Inputs:
        if any(store.get(a) is None for a in turn.asset_ids()):
            raise HTTPException(409, "Some pictures need to be sent again.")
        return Inputs(
            pictures={h: store.path(a) for h, a in turn.handles.items()},
            subject=turn.handle_of(turn.intent.subject) if turn.intent.subject else None,
            refs=[(h, r.role) for r in turn.intent.refs if (h := turn.handle_of(r.asset))],
            pins=[(p.n, p.note, store.path(p.mask) if p.mask else None) for p in turn.pins],
            subject_mask=store.path(turn.subject_mask) if turn.subject_mask else None,
        )

    @app.post("/api/turns")
    def turn(body: Turn):
        inputs = inputs_for(body)
        eta = estimates.expect(body.intent.op, body.pace, body.n)

        def work(job: Job) -> None:
            started = time.monotonic()
            progress = Work(job, store, engine.provenance(body))
            engine.turn(body, inputs, progress)
            if not progress.results:
                raise EngineError("The studio finished without a picture.", "Try again, perhaps in fewer words.")
            ms = int((time.monotonic() - started) * 1000)
            estimates.record(body.intent.op, body.pace, body.n, ms)
            job.emit("done", ms=ms)

        return {"job": jobs.submit(work).id, "eta": eta}

    def find(job_id: str) -> Job:
        job = jobs.jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "The studio has no such job.")
        return job

    @app.get("/api/jobs/{job_id}")
    def job_state(job_id: str):
        job = find(job_id)
        return {"state": job.state, "events": job.events}

    @app.get("/api/jobs/{job_id}/events")
    async def job_events(job_id: str):
        job = find(job_id)

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
    def cancel(job_id: str):
        find(job_id)
        return {"ok": jobs.cancel(job_id)}

    def picture(asset_id: str | None) -> Path | None:
        if not asset_id:
            return None
        path = store.path(asset_id)
        if path is None:
            raise HTTPException(409, "The picture needs to be sent again.")
        return path

    @app.post("/api/rooms")
    def room(ask: RoomAsk):
        return normalise_room(engine.room(ask), ask.text)

    @app.post("/api/looks")
    def look(ask: LookAsk):
        return normalise_look(engine.look(ask, picture(ask.asset)), ask.text)

    @app.post("/api/backdrops")
    def backdrops(ask: BackdropAsk):
        ideas = normalise_backdrops(engine.backdrops(ask, picture(ask.asset)))
        if not ideas:
            raise EngineError("No ideas came back this time.", "Try again, or say where you would like to be.")
        return {"backdrops": ideas}

    app.mount("/", StaticFiles(directory=paths.WEB, html=True), name="web")
    return app
