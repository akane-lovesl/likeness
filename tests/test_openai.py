"""The openai engine against a stand-in for the OpenAI API, served here: streamed partial pictures and the picture,
the format a portrait asked for, the marked regions sent as a mask, the API's refusals said plainly, and the words-only
asks. Nothing here reaches the network, and no key is real."""

from __future__ import annotations

import base64
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from likeness.engines import EngineError
from likeness.engines.openai_images import OpenAIImages
from likeness.server import create_app

from conftest import follow, picture, png, upload


def _jpeg(size, colour) -> str:
    buf = io.BytesIO()
    Image.new("RGB", size, colour).save(buf, "JPEG")
    return base64.b64encode(buf.getvalue()).decode()


class FakeAPI(BaseHTTPRequestHandler):
    seen: list[dict] = []
    refuse = ""

    def log_message(self, *args):  # quiet
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        FakeAPI.seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "type": self.headers.get("Content-Type", ""), "body": body})
        if FakeAPI.refuse:
            self.send_response(400 if FakeAPI.refuse == "safety" else 401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            code = "moderation_blocked" if FakeAPI.refuse == "safety" else "invalid_api_key"
            self.wfile.write(json.dumps({"error": {"message": "no", "code": code}}).encode())
            return
        if self.path.endswith("/chat/completions"):
            answer = {"name": "Velvet hour", "line": "Late light", "prompt": "warm", "ramp": ["#220000", "#ffddaa"], "keep": .5, "grain": .2, "bloom": .3, "vignette": .4}
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"choices": [{"message": {"content": json.dumps(answer)}}]}).encode())
            return
        size = (1024, 1024) if b"1024x1024" in body else (1024, 1536)
        kind = "image_edit" if self.path.endswith("/edits") else "image_generation"
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for i, colour in enumerate([(40, 40, 40), (120, 80, 80)]):
            self.wfile.write(f"event: {kind}.partial_image\ndata: {json.dumps({'type': kind + '.partial_image', 'partial_image_index': i, 'b64_json': _jpeg(size, colour)})}\n\n".encode())
        self.wfile.write(f"event: {kind}.completed\ndata: {json.dumps({'type': kind + '.completed', 'b64_json': _jpeg(size, (220, 120, 160))})}\n\n".encode())


@pytest.fixture
def api(monkeypatch):
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAPI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    FakeAPI.seen, FakeAPI.refuse = [], ""
    monkeypatch.setenv("OPENAI_BASE_URL", f"http://127.0.0.1:{server.server_port}/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    yield FakeAPI
    server.shutdown()


@pytest.fixture
def live(api, tmp_path):
    with TestClient(create_app(OpenAIImages({}), home=tmp_path / "home", open_door=True, config={"studio": {"workers": 2}, "codex": {}})) as c:
        yield c


def test_a_portrait_streams_as_it_develops_and_arrives_in_the_format_asked(live, api):
    photo = upload(live, png((300, 400), (200, 170, 140)))
    turn = {"id": "p1", "text": "Repaint this person as a storybook royal portrait.", "pace": "fine", "aspect": "square",
            "handles": {"A": photo}, "intent": {"op": "restyle", "subject": photo}}
    events = follow(live, live.post("/api/turns", json=turn).json()["job"])
    kinds = [e["type"] for e in events]
    assert kinds.count("partial") == 2 and kinds.index("partial") < kinds.index("result") and kinds[-1] == "done"
    result = next(e for e in events if e["type"] == "result")
    assert result["provenance"]["kind"] == "render" and "gpt-image" in result["provenance"]["detail"]
    assert picture(live, result["url"]).size == (1024, 1024)
    sent = api.seen[-1]
    assert sent["path"] == "/v1/images/edits" and sent["auth"] == "Bearer sk-test-not-real"
    assert b'name="size"\r\n\r\n1024x1024' in sent["body"] and b'name="stream"\r\n\r\ntrue' in sent["body"]
    assert b"storybook royal portrait" in sent["body"]


def test_words_alone_are_painted_by_the_generations_endpoint(live, api):
    events = follow(live, live.post("/api/turns", json={"id": "p2", "text": "a lighthouse in a teacup", "pace": "quick", "intent": {"op": "create"}}).json()["job"])
    assert any(e["type"] == "result" for e in events)
    sent = api.seen[-1]
    assert sent["path"] == "/v1/images/generations"
    body = json.loads(sent["body"])
    assert body["stream"] is True and body["model"] == "gpt-image-2.6-flare" and body["quality"] == "low"


def test_marked_regions_go_as_a_mask_transparent_where_it_may_change(live, api):
    subject = upload(live, png((120, 180), (180, 180, 180)))
    mask = upload(live, png((120, 180), (0, 0, 0), box=(0, 0, 59, 59)), "mask")
    turn = {"id": "p3", "text": "", "handles": {"A": subject}, "intent": {"op": "region", "subject": subject}, "pins": [{"n": 1, "note": "a red bow", "mask": mask}]}
    follow(live, live.post("/api/turns", json=turn).json()["job"])
    body = api.seen[-1]["body"]
    start = body.index(b'name="mask"')
    data = body[body.index(b"\r\n\r\n", start) + 4:]
    with Image.open(io.BytesIO(data)) as m:
        alpha = m.convert("RGBA").getchannel("A")
        assert alpha.getpixel((10, 10)) == 0 and alpha.getpixel((100, 160)) == 255
    assert b"a red bow" in body


def test_refusals_are_said_plainly(live, api):
    api.refuse = "safety"
    events = follow(live, live.post("/api/turns", json={"id": "p4", "text": "x", "intent": {"op": "create"}}).json()["job"])
    failed = next(e for e in events if e["type"] == "failed")
    assert "safety" in failed["message"] and failed["hint"]
    api.refuse = "key"
    with pytest.raises(EngineError, match="key was not accepted"):
        OpenAIImages({}).look(type("Ask", (), {"text": "x"})(), None)


def test_words_only_asks_use_a_strict_schema(live, api):
    look = live.post("/api/looks", json={"text": "velvet evening"}).json()
    assert look["name"]
    sent = json.loads(api.seen[-1]["body"])
    assert sent["response_format"]["json_schema"]["strict"] is True


def test_the_engine_will_not_start_without_a_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="OPENAI_API_KEY"):
        OpenAIImages({})


def test_the_studio_keeps_a_history_of_what_it_made(client):
    for i in range(2):
        follow(client, client.post("/api/turns", json={"id": f"h{i}", "text": "a red roof", "pace": "quick", "intent": {"op": "create"}}).json()["job"])
    made = client.get("/api/history").json()["made"]
    assert len(made) == 2 and made[0]["created"] >= made[1]["created"]
    assert all(m["url"].startswith("api/assets/") and m["provenance"]["kind"] == "simulated" for m in made)


def test_the_styles_art_is_served_and_cached(client):
    res = client.get("/styles/princess/sofia.webp")
    assert res.status_code == 200 and res.headers["content-type"] == "image/webp"
