"""Shared pieces for the studio's tests: a studio on a fast simulator, pictures made on the spot, and a way to follow
a job to its end. Nothing here is a photograph of anyone."""

from __future__ import annotations

import io
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from likeness.engines.simulator import Simulator
from likeness.server import create_app

FAKE_CODEX = [sys.executable, str(Path(__file__).with_name("fake_codex.py"))]
CONFIG = {"studio": {"engine": "simulator", "workers": 2}, "codex": {}}


def png(size=(96, 144), colour=(190, 120, 90), box=None, fill=(255, 255, 255)) -> bytes:
    image = Image.new("RGB", size, colour)
    if box:
        ImageDraw.Draw(image).rectangle(box, fill=fill)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def upload(client, data: bytes, kind: str = "image") -> str:
    res = client.post("/api/assets", files={"file": ("x.png", data, "image/png")}, data={"kind": kind})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def follow(client, job: str, timeout: float = 30) -> list[dict]:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        state = client.get(f"/api/jobs/{job}").json()
        if state["state"] in ("done", "failed", "cancelled"):
            return state["events"]
        time.sleep(0.03)
    raise AssertionError("the job did not finish")


def picture(client, url: str) -> Image.Image:
    return Image.open(io.BytesIO(client.get("/" + url.lstrip("/")).content)).convert("RGB")


@pytest.fixture
def studio(tmp_path):
    def make(speed: float = 0.02, open_door: bool = True) -> TestClient:
        return TestClient(create_app(Simulator(speed=speed), home=tmp_path / "home", open_door=open_door, config=CONFIG))
    return make


@pytest.fixture
def client(studio):
    with studio() as c:
        yield c
