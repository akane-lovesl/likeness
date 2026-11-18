"""The simulator paints something for every kind of change, and stamps all of it."""

import pytest
from PIL import Image, ImageDraw

from likeness.engines.simulator import Simulator, stamp
from likeness.turns import Inputs, Turn

OPS = ["create", "edit", "restyle", "reference", "blend", "region", "backdrop", "remove", "vary"]


@pytest.mark.parametrize("op", OPS)
def test_every_kind_of_change_paints_something(tmp_path, op):
    a, b, m = tmp_path / "a.png", tmp_path / "b.png", tmp_path / "m.png"
    Image.new("RGB", (80, 120), (200, 150, 120)).save(a)
    Image.new("RGB", (80, 120), (30, 60, 140)).save(b)
    mask = Image.new("L", (80, 120), 0)
    ImageDraw.Draw(mask).rectangle((10, 10, 40, 40), fill=255)
    mask.save(m)
    pins = op in ("region", "remove")
    turn = Turn(id="x", text="make it warmer and dreamy", handles={"A": "a", "B": "b"},
                intent={"op": op, "subject": "a", "refs": [{"asset": "b", "role": "style"}]},
                look={"name": "Film", "prompt": "vintage film"} if op == "restyle" else None,
                backdrop={"name": "Harbour", "words": "a harbour at dusk"} if op == "backdrop" else None,
                pins=[{"n": 1, "note": "gold", "print": "a", "mask": "m"}] if pins else [])
    inputs = Inputs(pictures={"A": a, "B": b}, subject="A", refs=[("B", "style")], pins=[(1, "gold", m)] if pins else [])
    made = Simulator().paint(turn, inputs, 0)
    assert made.mode == "RGB" and made.width > 0
    if op != "create":
        assert made.size == (80, 120)
    assert stamp(made).size == made.size
