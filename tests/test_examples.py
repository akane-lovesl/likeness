"""The Lookbook's examples: made through the engine in the app's own words, and written where the app reads them."""

import json

from conftest import FAKE_CODEX
from PIL import Image

from likeness import examples
from likeness.engines.codex import Codex


def test_the_studio_is_asked_in_the_apps_own_words():
    words = examples.vocabulary()
    assert set(words) == {"bangs", "brows", "colour", "cut", "lashes", "lips", "beard"}
    assert all(len(styles) >= 4 for styles in words.values())
    assert words["bangs"]["curtain"]["words"].startswith("curtain bangs") and words["colour"]["copper"]["name"] == "Copper"
    assert examples.words_for("a soft nude lip").startswith("Give them a soft nude lip. Keep everything else exactly as it is")


def test_the_cast_is_eight_invented_people_wearing_only_looks_the_app_offers():
    cast = examples.load_cast()
    people = cast["person"]
    assert len(people) == 8 and len({p["id"] for p in people}) == 8
    assert all(len(p["looks"]) == 3 for p in people)
    assert "does not exist" in cast["style"]["portrait"]
    worn = {part for p in people for part, _ in p["looks"]}
    assert worn == set(examples.vocabulary()), "every part the app offers is shown on someone"


def test_examples_are_made_turn_by_turn_and_written_where_the_app_reads_them(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_CODEX", "ok")
    engine = Codex({"command": FAKE_CODEX, "pace": {"quick": {"timeout": 60}}}, tmp_path / "home")
    cast = {"style": {"portrait": "{who}, against {backdrop}"}, "person": [{"id": "ama", "name": "Ama", "who": "an invented person", "backdrop": "sand",
                                                                              "looks": [["bangs", "curtain"], ["lips", "red"]]}]}
    out = tmp_path / "examples"
    done = examples.make(cast, engine, out, tmp_path / "home", pace="quick", say=lambda *_: None)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["kind"] == "render" and manifest["people"][0]["portrait"] == "ama/portrait.webp"
    curtain, red = manifest["people"][0]["looks"]
    assert curtain["image"] == "ama/bangs-curtain.webp" and curtain["words"].startswith("curtain bangs")
    assert curtain["angles"] == ["ama/bangs-curtain-right.webp", "ama/bangs-curtain-profile.webp", "ama/bangs-curtain-left.webp"] and red["angles"] == []
    for path in ["ama/portrait.webp", curtain["image"], red["image"], *curtain["angles"]]:
        assert Image.open(out / path).size == (768, 1024)
    assert [t["op"] for t in done["turns"]] == ["create", "edit", "angles", "edit"]
    briefs = [(job / "brief.md").read_text(encoding="utf-8") for job in (tmp_path / "home" / "jobs").iterdir()]
    edit = next(b for b in briefs if "Give them curtain bangs" in b)
    assert "Keep everything else exactly as it is" in edit and "A = in/A.png" in edit
    again = examples.make(cast, engine, out, tmp_path / "home", pace="quick", say=lambda *_: None)
    assert again["turns"] == [], "what is already on disk is kept, not made again"
