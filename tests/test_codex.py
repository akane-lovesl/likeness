"""The Codex engine against a stand-in CLI (tests/fake_codex.py): the command line it builds, how it reads Codex's
event stream, and what reaches the app when things go well, go wrong, or are stopped."""

import json
import threading
import time

import pytest
from conftest import FAKE_CODEX
from PIL import Image, ImageDraw

from likeness.engines import EngineError, Work
from likeness.engines.codex import Codex, Follow, probe
from likeness.jobs import Cancelled, Job
from likeness.rooms import contrast, normalise_room
from likeness.store import Store
from likeness.turns import BackdropAsk, Inputs, LookAsk, RoomAsk, Turn

CREATE = Turn(id="t", text="three pears", pace="quick", intent={"op": "create"})


@pytest.fixture
def engine(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "ok")
    return Codex({"command": FAKE_CODEX, "pace": {"quick": {"model": "gpt-test", "timeout": 30}}}, tmp_path / "home")


def run_turn(engine: Codex, turn: Turn, inputs: Inputs) -> Job:
    job = Job()
    engine.turn(turn, inputs, Work(job, Store(engine.home), engine.provenance(turn)))
    return job


def test_the_command_line_asks_for_json_a_sandbox_the_pace_and_the_pictures(engine, tmp_path):
    argv = engine.argv(tmp_path, {"model": "gpt-test", "effort": "high"}, [tmp_path / "A.png"])
    assert argv[2:4] == ["exec", "--json"] and "--skip-git-repo-check" in argv
    assert argv[argv.index("-C") + 1] == str(tmp_path) and argv[argv.index("--sandbox") + 1] == "workspace-write"
    assert argv[argv.index("-m") + 1] == "gpt-test" and "model_reasoning_effort=high" in argv
    assert argv[argv.index("-i") + 1] == str(tmp_path / "A.png") and argv[-2:] == ["--", "-"]


def test_a_turn_goes_through_codex_and_comes_back_as_renders(engine, tmp_path):
    a, m = tmp_path / "a.png", tmp_path / "m.png"
    Image.new("RGB", (64, 96), (200, 150, 120)).save(a)
    mask = Image.new("L", (32, 48), 0)
    ImageDraw.Draw(mask).rectangle((0, 0, 15, 15), fill=255)
    mask.save(m)
    turn = Turn(id="t", text="Make @A golden", pace="quick", n=2, handles={"A": "a"}, intent={"op": "region", "subject": "a"}, taste="warm light, film grain",
                pins=[{"n": 1, "note": "gold", "print": "a", "mask": "m"}])
    job = run_turn(engine, turn, Inputs(pictures={"A": a}, subject="A", pins=[(1, "gold", m)]))
    kinds = [e["type"] for e in job.events]
    assert kinds.count("result") == 2 and kinds[-1] == "reply"
    assert next(e for e in job.events if e["type"] == "plan")["plan"]["summary"] == "Painting three pears"
    assert "Reading the request" in [e.get("text") for e in job.events if e["type"] == "note"]
    result = next(e for e in job.events if e["type"] == "result")
    assert result["provenance"]["kind"] == "render" and "Quick" in result["provenance"]["detail"] and result["prompt"] == "three pears, blue cloth"
    reply = next(e for e in job.events if e["type"] == "reply")
    assert reply["text"] == "Three pears, as asked." and len(reply["suggestions"]) == 3
    folder = next((engine.home / "jobs").iterdir())
    brief = (folder / "brief.md").read_text(encoding="utf-8")
    assert "A = in/A.png" in brief and "in/A.pin1.png" in brief and "in/A.edit.png" in brief and "Make 2 pictures" in brief
    assert "standing taste" in brief and "warm light, film grain" in brief
    edit = Image.open(folder / "in" / "A.edit.png")
    assert edit.mode == "RGBA" and edit.getpixel((2, 2))[3] == 0 and edit.getpixel((60, 90))[3] == 255
    argv = json.loads((folder / "fake-argv.json").read_text())
    assert argv[argv.index("-m") + 1] == "gpt-test" and "model_reasoning_effort=low" in argv


def test_every_angle_is_asked_of_gpt_image_one_picture_per_angle(engine, tmp_path):
    a = tmp_path / "a.png"
    Image.new("RGB", (64, 96), (200, 150, 120)).save(a)
    turn = Turn(id="t", text="@A from every angle", pace="quick", n=3, handles={"A": "a"}, intent={"op": "angles", "subject": "a"})
    job = run_turn(engine, turn, Inputs(pictures={"A": a}, subject="A"))
    assert [e["type"] for e in job.events].count("result") == 3
    brief = (next((engine.home / "jobs").iterdir()) / "brief.md").read_text(encoding="utf-8")
    assert "profile" in brief and "three-quarter" in brief and "Only the camera moves" in brief and "Make 3 pictures" in brief


def test_codex_saying_it_cannot_reaches_the_app_with_its_hint(engine, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "fail")
    with pytest.raises(EngineError) as failed:
        run_turn(engine, CREATE, Inputs())
    assert "real person" in str(failed.value) and failed.value.hint == "Try a drawn sitter."


def test_a_codex_that_is_not_signed_in_says_so(engine, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "signin")
    with pytest.raises(EngineError) as failed:
        run_turn(engine, CREATE, Inputs())
    assert "signed in" in str(failed.value) and "codex login" in failed.value.hint


def test_a_crash_is_reported_plainly(engine, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "crash")
    with pytest.raises(EngineError, match="without a picture"):
        run_turn(engine, CREATE, Inputs())


def test_stop_ends_codex_at_once(engine, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "slow")
    job, outcome = Job(), {}

    def go():
        try:
            engine.turn(CREATE, Inputs(), Work(job, Store(engine.home), engine.provenance(CREATE)))
        except BaseException as error:
            outcome["error"] = error

    thread = threading.Thread(target=go)
    thread.start()
    deadline = time.monotonic() + 15
    while not any(e["type"] == "plan" for e in job.events) and time.monotonic() < deadline:
        time.sleep(.05)
    stopped = time.monotonic()
    job.stop.set()
    thread.join(15)
    assert isinstance(outcome.get("error"), Cancelled) and time.monotonic() - stopped < 5


def test_a_turn_that_runs_too_long_is_stopped(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "slow")
    engine = Codex({"command": FAKE_CODEX, "pace": {"quick": {"timeout": 1}}}, tmp_path / "home")
    with pytest.raises(EngineError, match="too long"):
        run_turn(engine, CREATE, Inputs())


def test_words_only_asks_read_codex_answer_and_are_made_safe(engine):
    room = normalise_room(engine.room(RoomAsk(text="a noisy arcade")), "a noisy arcade")
    assert room["type"] == "editorial" and room["frame"] == "glow" and room["voice"]["placeholder"] == "Press start"
    assert contrast(room["colors"]["ink"], room["colors"]["surface"]) >= 4.5
    argv = json.loads((next((engine.home / "asks").iterdir()) / "fake-argv.json").read_text())
    assert argv[argv.index("--sandbox") + 1] == "read-only" and "--output-schema" in argv and "-o" in argv
    assert engine.look(LookAsk(text="rose gold"), None)["name"] == "Rose Gold"
    assert len(engine.backdrops(BackdropAsk(text="", near=.5, dream=.5), None)) == 6


def test_the_older_event_format_and_fenced_markers_are_understood():
    job = Job()
    follow = Follow(Work(job, None, {}))
    follow.line(json.dumps({"id": "0", "msg": {"type": "agent_reasoning", "text": "**Choosing the light**\n\nWarm, low."}}))
    follow.line(json.dumps({"id": "1", "msg": {"type": "agent_message", "message": '\x60\x60\x60\nPLAN {"summary": "A warm edit", "prompt": "warm"}\n\x60\x60\x60'}}))
    follow.line("not json at all")
    follow.line(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": 'DONE {"reply": "Done.", "suggestions": ["More"]}'}}))
    assert [e["type"] for e in job.events] == ["stage", "note", "plan", "stage"]
    assert job.events[1]["text"] == "Choosing the light" and follow.prompt == "warm" and follow.reply["reply"] == "Done."


def test_a_picture_that_arrives_inside_an_event_is_kept(tmp_path):
    import base64
    import io

    buffer = io.BytesIO()
    Image.new("RGB", (40, 60), (10, 200, 90)).save(buffer, "PNG")
    follow = Follow(Work(Job(), None, {}))
    follow.spill = tmp_path / "tool"
    follow.line(json.dumps({"type": "item.completed", "item": {"type": "image_generation", "result": base64.b64encode(buffer.getvalue()).decode()}}))
    assert len(follow.loose) == 1 and Image.open(follow.loose[0]).size == (40, 60)


def test_probe_reports_what_the_studio_needs():
    report = probe({"command": FAKE_CODEX})
    assert report["ok"] and report["version"] and all(report["flags"].values()) and report["signed_in"]


def test_a_reference_and_the_persons_marks_are_named_for_what_they_are(engine, tmp_path):
    """The mirror's reference (role look) and the picture with the person's marks on it (role marks) go to Codex with
    the subject, each said for what it is, so GPT Image borrows from the one and follows the other."""
    a, b, c, m = tmp_path / "a.png", tmp_path / "b.png", tmp_path / "c.png", tmp_path / "m.png"
    for path, colour in ((a, (200, 150, 120)), (b, (30, 60, 140)), (c, (200, 150, 121))):
        Image.new("RGB", (64, 96), colour).save(path)
    mask = Image.new("L", (32, 48), 0)
    ImageDraw.Draw(mask).rectangle((0, 0, 15, 15), fill=255)
    mask.save(m)
    turn = Turn(id="r", text="Changes to @A", pace="quick", n=1, handles={"A": "a", "B": "b", "C": "c"},
                intent={"op": "region", "subject": "a", "refs": [{"asset": "c", "role": "marks"}, {"asset": "b", "role": "look"}]},
                pins=[{"n": 1, "note": "the fringe from the reference", "print": "a", "mask": "m"}])
    run_turn(engine, turn, Inputs(pictures={"A": a, "B": b, "C": c}, subject="A", refs=[("C", "marks"), ("B", "look")], pins=[(1, "the fringe from the reference", m)]))
    brief = (next((engine.home / "jobs").iterdir()) / "brief.md").read_text(encoding="utf-8")
    assert "a reference for the look" in brief and "never its face" in brief
    assert "the person's own rough marks" in brief and "never draw the marks into the result" in brief
