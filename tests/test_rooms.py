"""Whatever a model answers, the app only ever receives rooms, looks and ideas it can use."""

import re

from likeness.rooms import (BACKDROPS_SCHEMA, COLOUR_KEYS, LOOK_SCHEMA, ROOM_SCHEMA, WEATHERS, contrast, normalise_backdrops,
                            normalise_look, normalise_room)


def strict(schema: dict) -> None:
    if schema.get("type") == "object":
        assert schema["additionalProperties"] is False and sorted(schema["required"]) == sorted(schema["properties"])
        for value in schema["properties"].values():
            strict(value)
    if schema.get("type") == "array":
        strict(schema["items"])


def test_the_answer_schemas_are_strict():
    for schema in (ROOM_SCHEMA, LOOK_SCHEMA, BACKDROPS_SCHEMA):
        strict(schema)


def test_any_answer_becomes_a_room_the_app_can_wear():
    room = normalise_room({"colors": {"ink": "#ffffff", "surface": "#fefefe", "accent": "red"}, "weather": "lava", "radius": "round",
                           "motifs": "heart", "voice": {"placeholder": "x" * 99, "done": "Done!"}}, "lava lamp")
    assert all(re.fullmatch(r"#[0-9a-fA-F]{6}", room["colors"][k]) for k in COLOUR_KEYS)
    assert contrast(room["colors"]["ink"], room["colors"]["surface"]) >= 4.5
    assert room["sky"]["weather"] in WEATHERS and room["radius"] == 2.0 and room["motifs"] == ["sparkle"]
    assert len(room["voice"]["placeholder"]) <= 28 and room["voice"]["stages"]["draw"] and room["voice"]["done"] != list("Done!")
    assert normalise_room(None)["name"] == "A new room"


def test_a_look_ramp_runs_from_shadow_to_light_and_numbers_stay_in_range():
    look = normalise_look({"ramp": ["#ffffff", "#000000", "#808080"], "keep": 5, "grain": -1, "bloom": "lots"}, "x")
    assert look["ramp"] == ["#000000", "#808080", "#ffffff"] and look["keep"] == 1 and look["grain"] == 0 and look["bloom"] == .15


def test_backdrop_ideas_without_words_are_dropped():
    assert normalise_backdrops({"backdrops": [{"name": "A", "words": ""}, {"name": "B", "words": "b"}, "junk"]}) == [{"name": "B", "words": "b"}]
