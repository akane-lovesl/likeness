"""The studio over HTTP, on the simulator: what the app sends, what comes back, and what never gets in."""

import re

from conftest import follow, picture, png, upload

from likeness.rooms import COLOUR_KEYS, contrast


def test_the_studio_says_what_it_is(client):
    info = client.get("/studio.json").json()
    assert info["edition"] == "live" and info["engine"]["kind"] == "simulator"
    assert info["eta"]["quick"] < info["eta"]["fine"] < info["eta"]["deep"]


def test_words_become_a_picture_that_says_it_is_simulated(client):
    res = client.post("/api/turns", json={"id": "t1", "text": "a lighthouse at dusk", "pace": "quick", "intent": {"op": "create"}})
    assert res.status_code == 200 and res.json()["eta"] > 0
    events = follow(client, res.json()["job"])
    kinds = [e["type"] for e in events]
    assert kinds[0] == "stage" and kinds[-1] == "done"
    assert kinds.index("plan") < kinds.index("partial") < kinds.index("result") < kinds.index("reply") < kinds.index("done")
    result = next(e for e in events if e["type"] == "result")
    assert result["provenance"]["kind"] == "simulated" and "not a render" in result["provenance"]["detail"]
    made = picture(client, result["url"])
    assert made.size == (result["w"], result["h"])
    w, h = made.size
    band = [made.getpixel((x, h - 3)) for x in range(0, w, 7)]
    assert sum(sum(p) for p in band) / len(band) < 300, "the SIMULATED stamp's band is missing"
    reply = next(e for e in events if e["type"] == "reply")
    assert reply["text"] and len(reply["suggestions"]) == 3


def test_pictures_go_up_once_and_come_back(client):
    asset = client.post("/api/assets", files={"file": ("a.png", png(), "image/png")}, data={"kind": "image"}).json()
    assert (asset["w"], asset["h"]) == (96, 144)
    assert client.get("/" + asset["url"]).status_code == 200
    bad = client.post("/api/assets", files={"file": ("a.png", b"not a picture", "image/png")}, data={"kind": "image"})
    assert bad.status_code == 415


def test_a_region_change_stays_inside_its_mask(client):
    subject = upload(client, png((120, 180), (180, 180, 180)))
    mask = upload(client, png((120, 180), (0, 0, 0), box=(0, 0, 59, 59)), "mask")
    turn = {"id": "t2", "text": "Changes to @A", "pace": "quick", "handles": {"A": subject}, "intent": {"op": "region", "subject": subject},
            "pins": [{"n": 1, "note": "make it blue", "print": subject, "mask": mask}]}
    events = follow(client, client.post("/api/turns", json=turn).json()["job"])
    made = picture(client, next(e for e in events if e["type"] == "result")["url"])
    inside, outside = made.getpixel((10, 10)), made.getpixel((100, 120))
    assert inside[2] > inside[0] + 20, "the marked corner should have turned blue"
    assert max(abs(a - b) for a, b in zip(outside, (180, 180, 180))) <= 3, "outside the mask nothing changes"


def test_a_turn_naming_a_picture_the_studio_does_not_have_asks_for_it_again(client):
    res = client.post("/api/turns", json={"id": "t3", "text": "warmer", "handles": {"A": "deadbeef00"}, "intent": {"op": "edit", "subject": "deadbeef00"}})
    assert res.status_code == 409


def test_a_turn_can_be_stopped(studio):
    with studio(speed=1) as client:
        job = client.post("/api/turns", json={"id": "t4", "text": "a slow one", "pace": "deep", "intent": {"op": "create"}}).json()["job"]
        assert client.post(f"/api/jobs/{job}/cancel").json()["ok"]
        events = follow(client, job)
        assert events[-1]["type"] == "failed" and events[-1]["cancelled"]
        assert not any(e["type"] == "result" for e in events)


def test_the_event_stream_carries_the_whole_turn(client):
    job = client.post("/api/turns", json={"id": "t5", "text": "snow on a red roof", "pace": "quick", "n": 2, "intent": {"op": "create"}}).json()["job"]
    with client.stream("GET", f"/api/jobs/{job}/events") as stream:
        body = "".join(stream.iter_text())
    names = [line[7:] for line in body.splitlines() if line.startswith("event: ")]
    assert names.count("result") == 2 and names[-1] == "done"


def test_rooms_looks_and_backdrops_come_back_ready_to_wear(client):
    room = client.post("/api/rooms", json={"text": "a midnight jazz bar in the rain"}).json()
    assert room["dark"] and room["sky"]["weather"] in ("notes", "rain") and room["sound"] == "musicbox"
    assert all(re.fullmatch(r"#[0-9a-f]{6}", room["colors"][k]) for k in COLOUR_KEYS)
    assert contrast(room["colors"]["ink"], room["colors"]["surface"]) >= 4.5
    look = client.post("/api/looks", json={"text": "rose gold film"}).json()
    assert len(look["ramp"]) >= 3 and look["prompt"]
    ideas = client.post("/api/backdrops", json={"text": "", "near": 0.9, "dream": 0.9}).json()["backdrops"]
    assert len(ideas) == 6 and all(i["name"] and i["words"] for i in ideas)


def test_strangers_are_turned_away_until_they_pair(studio, tmp_path):
    with studio(open_door=False) as client:
        assert client.get("/studio.json").status_code == 401
        key = (tmp_path / "home" / "pairing.key").read_text().strip()
        res = client.get(f"/?pair={key}", follow_redirects=False)
        assert res.status_code in (302, 307) and "likeness_key" in res.headers["set-cookie"]
        client.cookies.set("likeness_key", key)
        assert client.get("/studio.json").status_code == 200
