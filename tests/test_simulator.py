"""The simulator paints something for every kind of change, and stamps all of it."""

import pytest
from PIL import Image, ImageDraw

from likeness.engines.simulator import Simulator, stamp
from likeness.turns import Inputs, Turn

OPS = ["create", "edit", "restyle", "reference", "blend", "region", "backdrop", "remove", "vary", "angles"]


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


def test_a_look_borrowed_and_marks_drawn_are_painted_with(tmp_path):
    """The mirror sends a reference (role look) and the picture with the person's marks on it (role marks) beside a
    change: the stand-in takes the reference's colours into the part and shows the marks it was given."""
    a, look, marks, m = tmp_path / "a.png", tmp_path / "look.png", tmp_path / "marks.png", tmp_path / "m.png"
    Image.new("RGB", (80, 120), (200, 150, 120)).save(a)
    Image.new("RGB", (80, 120), (20, 160, 60)).save(look)
    drawn = Image.new("RGB", (80, 120), (200, 150, 120))
    ImageDraw.Draw(drawn).line((5, 100, 75, 100), fill=(255, 40, 80), width=4)
    drawn.save(marks)
    mask = Image.new("L", (80, 120), 0)
    ImageDraw.Draw(mask).rectangle((10, 10, 40, 40), fill=255)
    mask.save(m)
    turn = Turn(id="y", text="Changes to @A", handles={"A": "a", "B": "look", "C": "marks"},
                intent={"op": "region", "subject": "a", "refs": [{"asset": "marks", "role": "marks"}, {"asset": "look", "role": "look"}]},
                pins=[{"n": 1, "note": "the fringe from the reference", "print": "a", "mask": "m"}])
    inputs = Inputs(pictures={"A": a, "B": look, "C": marks}, subject="A", refs=[("C", "marks"), ("B", "look")], pins=[(1, "the fringe from the reference", m)])
    made = Simulator().paint(turn, inputs, 0)
    inside, outside, mark = made.getpixel((25, 25)), made.getpixel((60, 70)), made.getpixel((40, 100))
    assert inside[1] > inside[0], "the reference's green is borrowed inside the part"
    assert outside == (200, 150, 120), "outside the part nothing changes"
    assert mark[0] > 230 and mark[1] < 90, "the marks show where they were drawn"
