"""The simulator: the studio's whole path without a model. It reads a turn as the real engine would, takes about as
long as a quick one, and paints a stand-in with Pillow (graded, masked, composited, restyled) that is stamped so it
can never pass for a render. Its rooms, looks and backdrop ideas come from a little vocabulary instead of a model."""

from __future__ import annotations

import colorsys
import hashlib
import math
import os
import random
import re
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

from ..estimates import DEFAULTS, OPS
from ..rooms import colours_for
from ..turns import BackdropAsk, Inputs, LookAsk, RoomAsk, Turn
from . import Work

STAMP = "SIMULATED · NOT A RENDER"
PROVENANCE = {"kind": "simulated", "label": "Simulated", "detail": "The simulator · a stand-in, not a render"}
SIZE = (768, 1152)
HUES = {"scarlet": 355, "crimson": 350, "red": 2, "blush": 345, "rose": 340, "pink": 335, "coral": 12, "peach": 22, "orange": 25,
        "amber": 38, "golden": 42, "gold": 44, "cream": 42, "lemon": 58, "yellow": 54, "lime": 85, "sage": 110, "green": 125,
        "emerald": 145, "mint": 158, "teal": 178, "aqua": 185, "cyan": 188, "sky": 200, "azure": 208, "blue": 215, "navy": 228,
        "indigo": 245, "lavender": 262, "violet": 265, "purple": 280, "lilac": 285, "plum": 300, "magenta": 310, "sepia": 32, "brown": 28}
PLANS = {
    "create": "Painting something new from your words", "edit": "Changing {subject} as you asked",
    "restyle": "Repainting {subject} as {look}", "reference": "Lending {subject} the light of {ref}",
    "blend": "Bringing {pictures} together", "region": "Changing only the marked parts of {subject}",
    "backdrop": "Moving {subject} to {place}", "remove": "Taking that out of {subject}", "vary": "Trying {n} takes on {subject}",
    "angles": "Walking round {subject}",
}
NOTES = {
    "create": ["Finding the light", "Laying in the sky", "Placing the horizon"], "edit": ["Reading the picture", "Matching the light", "Keeping faces as they are"],
    "restyle": ["Studying the look", "Mixing the palette", "Keeping the composition"], "reference": ["Studying the reference", "Borrowing its palette", "Matching the light"],
    "blend": ["Lining the pictures up", "Finding the seam", "Mixing the light"], "region": ["Finding the marked parts", "Changing only those", "Feathering the edges"],
    "backdrop": ["Lifting the subject", "Building the place", "Matching the light"], "remove": ["Finding what goes", "Filling the space", "Checking the seams"],
    "vary": ["A first take", "Another one", "Comparing them"], "angles": ["From their right", "In profile", "From their left"],
}
SUGGEST = {
    "create": ["Warmer light", "Make it night", "Three variations"], "edit": ["A little brighter", "Try a backdrop", "Three variations"],
    "restyle": ["Stronger", "Softer", "Another look"], "reference": ["Closer to the reference", "Keep more colour", "Three variations"],
    "blend": ["More of the first", "More of the second", "Try a backdrop"], "region": ["Brighter", "Try a backdrop", "Three variations"],
    "backdrop": ["Golden hour light", "Another place", "Make it night"], "remove": ["Clean up more", "Try a backdrop", "Warmer light"],
    "vary": ["Wilder", "Make it night", "Try a backdrop"], "angles": ["Closer", "Softer light", "Three variations"],
}
ROOM_WORDS = [   # (words, what they suggest); the first match wins for each setting
    (r"night|midnight|noir|space|neon|goth|dark|moon|cosmic|galaxy", {"dark": True}),
    (r"love|heart|valentine|princess|romance|sweet", {"weather": "hearts", "ornament": "heart", "type": "romance", "wipe": "heart", "frame": "arch", "sound": "musicbox"}),
    (r"rain|storm|drizzle|monsoon", {"weather": "rain", "ornament": "drop", "set": "window"}),
    (r"snow|winter|frost|ice|christmas", {"weather": "snow", "ornament": "snowflake", "light": "dawn"}),
    (r"flower|rose|garden|spring|bloom|petal|sakura|cherry", {"weather": "petals", "ornament": "flower", "set": "glasshouse"}),
    (r"music|jazz|song|piano|melody|opera", {"weather": "notes", "ornament": "notes", "sound": "musicbox"}),
    (r"autumn|fall|forest|leaf|woods|cabin", {"weather": "leaves", "ornament": "leaf", "wipe": "leaf", "texture": "linen"}),
    (r"sea|ocean|beach|wave|surf|summer|riviera|coast", {"weather": "glints", "ornament": "wave", "wipe": "wave", "set": "awning", "light": "day"}),
    (r"retro|arcade|pixel|8.?bit|game|synth|vapou?r|cyber", {"type": "pixel", "texture": "scanlines", "sound": "synth", "wipe": "scan", "frame": "glow", "ornament": "bolt"}),
    (r"typewriter|office|paper|letter|newspaper|detective|library", {"type": "typewriter", "sound": "typewriter", "texture": "grain-heavy", "frame": "polaroid"}),
    (r"fire|ember|cosy|cozy|hearth|campfire|candle", {"weather": "embers", "ornament": "flame", "light": "golden"}),
    (r"party|birthday|celebrat|confetti|festival|carnival", {"weather": "confetti", "ornament": "confetti", "motion": "bouncy"}),
    (r"fairy|magic|sparkle|glitter|enchant|wish", {"weather": "sparkles", "ornament": "sparkle", "wipe": "star", "motion": "float"}),
    (r"underwater|bubble|aquarium|mermaid", {"weather": "bubbles", "ornament": "shell", "motion": "float"}),
    (r"fog|mist|haze|moor|ghost", {"weather": "fog", "ornament": "cloud"}),
    (r"firefl|meadow|summer night", {"weather": "fireflies"}),
    (r"star|astro|planet|cosmic|galaxy", {"weather": "stars", "ornament": "planet", "wipe": "star"}),
    (r"tea|cafe|café|coffee|bakery|cake", {"ornament": "teacup", "set": "window", "texture": "linen"}),
    (r"royal|palace|regal|crown|baroque|castle", {"type": "classical", "ornament": "crown", "frame": "arch", "set": "dome"}),
    (r"minimal|clean|modern|swiss|gallery", {"type": "grotesk", "texture": "none", "frame": "square", "motion": "crisp", "ornament": "asterisk"}),
]
PLACES = [   # name, words, near (0 close .. 1 far), dream (0 real .. 1 dreamt)
    ("Kitchen window", "a sunlit kitchen window, herbs on the sill, soft morning light", .1, .1),
    ("Library nook", "a quiet library nook, tall shelves, a green lamp glowing", .15, .15),
    ("Painter's studio", "an artist's studio, canvases against the wall, north light", .15, .25),
    ("Tea room", "a tea room with rose wallpaper, lace and porcelain", .1, .45),
    ("Greenhouse", "a glass greenhouse full of ferns and hanging plants", .3, .3),
    ("Velvet theatre", "an empty theatre, red velvet seats, a gold curtain", .35, .4),
    ("Candy shop", "a pastel candy shop, jars of sweets, a striped awning", .2, .6),
    ("Neon alley", "a rainy alley with pink and blue neon reflections", .45, .35),
    ("Rooftop at dusk", "a city rooftop at dusk, string lights, a violet sky", .6, .2),
    ("Harbour morning", "a small harbour in the morning, boats, gulls, pale gold light", .75, .1),
    ("Wildflower field", "a wildflower field in late afternoon, warm haze", .8, .2),
    ("Snowy pines", "a pine forest in fresh snow at blue hour", .7, .25),
    ("Lighthouse cliff", "a lighthouse on a cliff above a wild sea", .9, .3),
    ("Underwater ballroom", "a ballroom under the sea, chandeliers, drifting fish", .45, .95),
    ("Storybook forest", "a storybook forest, giant mushrooms, glowing fireflies", .55, .85),
    ("Desert observatory", "a desert observatory under a sky full of stars", .85, .55),
    ("Cloud palace", "a palace made of clouds, pink light, floating stairs", .7, .9),
    ("Moon garden", "a garden on the moon, silver flowers, the Earth in the sky", .85, 1.0),
]


def _seed(*parts) -> int:
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


def _rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, max(0, min(1, l)), max(0, min(1, s)))
    return round(r * 255), round(g * 255), round(b * 255)


def _hue_in(text: str, default: int | None = None) -> int | None:
    for word, hue in HUES.items():
        if re.search(rf"\b{word}\b", text, re.I):
            return hue
    return default


def _luma(c) -> float:
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _gradient(size, top, bottom) -> Image.Image:
    return Image.composite(Image.new("RGB", size, bottom), Image.new("RGB", size, top), Image.linear_gradient("L").resize(size))


def _palette(image: Image.Image, n: int = 5) -> list[tuple[int, int, int]]:
    small = image.convert("RGB").resize((64, 64)).quantize(n).convert("RGB")
    return sorted((c for _, c in small.getcolors(4096) or []), key=_luma)


def scene(words: str, size=SIZE, salt: int = 0) -> Image.Image:
    """A place from words: a room, a city, the sea or hills, at the time of day the words suggest."""
    rnd, w = random.Random(_seed(words, salt)), words.lower()
    width, height = size
    night = bool(re.search(r"\b(night|midnight|moon|stars?|neon|dark|observatory)\b", w))
    dusk = bool(re.search(r"\b(dusk|sunset|golden|evening|twilight|blue hour)\b", w))
    named = _hue_in(w)
    hue = named if named is not None else rnd.choice((18, 28, 340, 45, 200))   # an accent; the sky keeps to the time of day
    shift = 0 if named is None else ((named - 220 + 180) % 360 - 180) * .12
    if night:
        top, low = _rgb(232 + shift, .55, .07), _rgb(252 + shift, .42, .25)
    elif dusk:
        top, low = _rgb(258 + shift, .36, .34), _rgb(16 + shift, .82, .7)
    else:
        top, low = _rgb(206 + shift, .58, .64), _rgb(196 + shift, .5, .9)
    image = _gradient(size, top, low)
    d = ImageDraw.Draw(image, "RGBA")
    if night:
        for _ in range(140):
            x, y, r = rnd.uniform(0, width), rnd.uniform(0, height * .6), rnd.choice((1, 1, 1.5, 2.2))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 250, 235, rnd.randrange(120, 255)))
    r = int(width * rnd.uniform(.07, .13))
    cx, cy = int(width * rnd.uniform(.22, .78)), int(height * rnd.uniform(.14, .3))
    d.ellipse([cx - r * 2, cy - r * 2, cx + r * 2, cy + r * 2], fill=(255, 240, 210, 26))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*(_rgb(48, .25, .9) if night else _rgb(hue if dusk else 44, .9, .78)), 240))
    sea = bool(re.search(r"sea|ocean|beach|lake|coast|lighthouse|surf|water|underwater", w))
    if not sea and re.search(r"room|kitchen|library|studio|tea ?room|theatre|shop|ballroom|nook|wall|window|indoor|cafe|café", w):
        wall = _rgb(hue, .22, .18 if night else .84)
        d.rectangle([0, 0, width, height], fill=(*wall, 255))
        wx0, wy0, wx1, wy1 = int(width * .18), int(height * .12), int(width * .82), int(height * .52)
        image.paste(_gradient((wx1 - wx0, wy1 - wy0), top, low), (wx0, wy0))
        d = ImageDraw.Draw(image, "RGBA")
        d.rectangle([wx0, wy0, wx1, wy1], outline=_rgb(hue, .15, .12 if night else .97), width=max(6, width // 60))
        d.line([(width // 2, wy0), (width // 2, wy1)], fill=_rgb(hue, .15, .12 if night else .97), width=max(4, width // 90))
        d.rectangle([0, int(height * .7), width, height], fill=(*_rgb(hue + 10, .3, .1 if night else .5), 255))
        for i in range(rnd.randrange(3, 7)):
            x = rnd.uniform(.05, .9) * width
            d.rectangle([x, height * .6, x + width * .06, height * .7], fill=(*_rgb(hue + rnd.randrange(-30, 30), .45, .5), 255))
    elif not sea and re.search(r"city|street|rooftop|alley|neon|skyline|town", w):
        x = 0.0
        while x < width:
            bw, bh = rnd.uniform(.08, .2) * width, rnd.uniform(.25, .6) * height
            d.rectangle([x, height - bh, x + bw, height], fill=(*_rgb(hue + 220, .25, .1 if night else .32), 255))
            for wy in range(int(height - bh + 14), height - 10, 22):
                for wx in range(int(x + 8), int(x + bw - 8), 16):
                    if rnd.random() < (.45 if night else .2):
                        d.rectangle([wx, wy, wx + 7, wy + 10], fill=(255, 214, 140, 230) if night else (220, 236, 255, 160))
            x += bw + rnd.uniform(2, 10)
    elif sea or re.search(r"harbou?r", w):
        horizon = int(height * .56)
        image.paste(_gradient((width, height - horizon), _rgb(212 + shift, .45, .42 if not night else .14), _rgb(222 + shift, .5, .18 if not night else .05)), (0, horizon))
        d = ImageDraw.Draw(image, "RGBA")
        for i in range(40):
            y = horizon + (i / 40) ** 1.6 * (height - horizon)
            half = (6 + i * 2.2) * rnd.uniform(.6, 1.4)
            d.line([(cx - half, y), (cx + half, y)], fill=(255, 236, 200, 150 - i * 3), width=2)
    else:
        for layer in range(3):
            base = height * (.55 + layer * .13)
            amp, phase, freq = height * (.06 - layer * .012), rnd.uniform(0, 6.3), rnd.uniform(1.2, 2.6)
            points = [(x, base - amp * (1 + math.sin(phase + freq * x / width * math.pi))) for x in range(0, width + 8, 8)]
            shade = _rgb((named if named is not None else 128) + layer * 10, .3, (.16 if night else .46) - layer * .1)
            d.polygon(points + [(width, height), (0, height)], fill=(*shade, 255))
            if layer == 2 and re.search(r"forest|pine|wood|tree|garden|field", w):
                for _ in range(26):
                    tx, th = rnd.uniform(0, width), rnd.uniform(.08, .18) * height
                    d.polygon([(tx, base - th), (tx - th * .3, base + 6), (tx + th * .3, base + 6)], fill=(*_rgb(140, .3, .1 if night else .2), 255))
    return image.filter(ImageFilter.SMOOTH)


def grade(image: Image.Image, words: str, salt: int = 0, strength: float = 1.0) -> Image.Image:
    """Colour and light from words: warm, cool, a named colour, brighter, darker, vivid, soft, black and white."""
    rnd, w, out = random.Random(_seed(words, salt)), words.lower(), image.convert("RGB")
    if re.search(r"black and white|b&w|\bmono|greyscale|grayscale|noir", w):
        out = ImageEnhance.Contrast(ImageOps.grayscale(out).convert("RGB")).enhance(1.25)
    hue = _hue_in(w)
    if hue is None and re.search(r"warm|golden|sunset|sunny|summer|cosy|cozy|autumn", w):
        hue = 32
    if hue is None and re.search(r"cool|cold|winter|icy|moon|night|blue hour", w):
        hue = 215
    if hue is None and salt:
        hue = rnd.randrange(360)
    if hue is not None:
        tinted = ImageOps.colorize(ImageOps.grayscale(out), _rgb(hue + 200, .5, .08), _rgb(hue, .6, .95), mid=_rgb(hue, .65, .5))
        out = Image.blend(out, tinted, min(.75, .32 * strength))
    if re.search(r"bright|lighter|airy|sunlit", w):
        out = ImageEnhance.Brightness(out).enhance(1 + .18 * strength)
    if re.search(r"dark|moody|dramatic|night", w):
        out = ImageEnhance.Contrast(ImageEnhance.Brightness(out).enhance(1 - .16 * strength)).enhance(1 + .15 * strength)
    if re.search(r"vivid|saturat|\bpop|colou?rful|bold", w):
        out = ImageEnhance.Color(out).enhance(1 + .45 * strength)
    if re.search(r"soft|dream|hazy|misty|glow", w):
        out = Image.blend(out, out.filter(ImageFilter.GaussianBlur(6)), .45)
    return out


def restyle(image: Image.Image, words: str) -> Image.Image:
    """A look from its name and prompt: pixel, sketch, comic, paint, film, or a duotone in its colour."""
    w, gray = words.lower(), ImageOps.grayscale(image)
    if re.search(r"pixel|8.?bit|arcade|retro game", w):
        small = image.resize((max(1, image.width // 14), max(1, image.height // 14)), Image.Resampling.BILINEAR)
        return small.quantize(18).convert("RGB").resize(image.size, Image.Resampling.NEAREST)
    if re.search(r"sketch|pencil|charcoal|line art|\bink", w):
        lines = ImageOps.invert(gray.filter(ImageFilter.FIND_EDGES).point(lambda v: min(255, v * 3))).convert("RGB")
        paper = Image.new("RGB", image.size, (246, 240, 228))
        return Image.blend(ImageChops.multiply(paper, lines), ImageChops.multiply(paper, gray.convert("RGB")), .22)
    if re.search(r"comic|pop art|poster|cel|cartoon|anime", w):
        edges = gray.filter(ImageFilter.FIND_EDGES).point(lambda v: 0 if v > 38 else 255).convert("RGB")
        return ImageChops.multiply(ImageOps.posterize(ImageEnhance.Color(image).enhance(1.5), 3), edges)
    if re.search(r"water ?colou?r|paint|oil|gouache|impression", w):
        soft = image.filter(ImageFilter.ModeFilter(7)).filter(ImageFilter.SMOOTH_MORE)
        return ImageChops.soft_light(soft, Image.effect_noise(image.size, 22).convert("RGB"))
    if re.search(r"film|analog|polaroid|vintage|sepia|old", w):
        toned = Image.blend(image, ImageOps.colorize(gray, (30, 20, 14), (250, 236, 210), mid=(160, 120, 90)), .55)
        return ImageChops.soft_light(toned, Image.effect_noise(image.size, 30).convert("RGB"))
    hue = _hue_in(w, _seed(w) % 360)
    return Image.blend(image, ImageOps.colorize(gray, _rgb(hue + 180, .5, .1), _rgb(hue, .5, .94), mid=_rgb(hue, .6, .55)), .7)


def _mask(path: Path | None, size, guess: str = "centre") -> Image.Image:
    if path is not None:
        with Image.open(path) as m:
            mask = m.convert("L").resize(size)
    else:
        mask = Image.new("L", size, 0)
        w, h = size
        box = [w * .2, h * .14, w * .8, h * 1.08] if guess == "figure" else [w * .3, h * .3, w * .7, h * .7]
        ImageDraw.Draw(mask).ellipse(box, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(max(2, size[0] // 150)))


def _open(path: Path, longest: int = 1024) -> Image.Image:
    with Image.open(path) as image:
        picture = ImageOps.exif_transpose(image).convert("RGB")
    picture.thumbnail((longest, longest))
    return picture


def stamp(image: Image.Image) -> Image.Image:
    out = image.convert("RGB").copy()
    w, h = out.size
    band = max(24, h // 26)
    d = ImageDraw.Draw(out, "RGBA")
    d.rectangle([0, h - band, w, h], fill=(16, 14, 12, 214))
    font = _font(max(10, int(band * .46)))
    d.text((w / 2, h - band / 2), STAMP, fill=(250, 244, 232, 255), font=font, anchor="mm")
    return out


def _developing(image: Image.Image, step: int) -> Image.Image:
    if step == 1:
        w, h = image.size
        return image.resize((max(1, w // 28), max(1, h // 28)), Image.Resampling.BILINEAR).resize(image.size, Image.Resampling.BICUBIC)
    return image.filter(ImageFilter.GaussianBlur(7))


class Simulator:
    id = "simulator"
    kind = "simulator"

    def __init__(self, speed: float | None = None) -> None:
        self.speed = float(os.environ.get("LIKENESS_SIM_SPEED", "1")) if speed is None else speed

    def describe(self) -> dict:
        return {"id": self.id, "kind": self.kind, "label": "Simulator", "ready": True,
                "detail": "Paints stand-ins with Pillow so the whole path can be tried anywhere. Nothing it makes is a render."}

    def provenance(self, turn: Turn) -> dict:
        return PROVENANCE

    def _wait(self, work: Work, ms: float) -> None:
        end = time.monotonic() + ms * self.speed / 1000
        while (left := end - time.monotonic()) > 0:
            work.check()
            time.sleep(min(.05, left))
        work.check()

    def paint(self, turn: Turn, inputs: Inputs, index: int) -> Image.Image:
        op, text = turn.intent.op, turn.text
        subject = inputs.subject or next(iter(inputs.pictures), None)
        if subject is None or op == "create":
            return scene(text or "a quiet morning", SIZE, index)
        base = _open(inputs.pictures[subject])
        others = [_open(p) for h, p in inputs.pictures.items() if h != subject]
        if op == "restyle":
            return restyle(base, f"{turn.look.name} {turn.look.prompt}" if turn.look else text)
        if op == "reference" and others:
            colours = _palette(others[0])
            dark, mid, light = colours[0], colours[len(colours) // 2], colours[-1]
            return Image.blend(base, ImageOps.colorize(ImageOps.grayscale(base), dark, light, mid=mid), .62)
        if op == "blend" and others:
            fade = Image.linear_gradient("L").rotate(90, expand=True).resize(base.size)
            return Image.composite(others[0].resize(base.size), base, fade)
        if op in ("region", "remove") and inputs.pins:
            out = base
            for n, note, mask_path in inputs.pins:
                mask = _mask(mask_path, base.size)
                if op == "remove" or re.search(r"remove|erase|take out|get rid|delete", note, re.I):
                    changed = base.filter(ImageFilter.GaussianBlur(max(12, base.width // 28)))
                    mask = mask.filter(ImageFilter.MaxFilter(9))
                else:
                    changed = grade(out, note, strength=1.8)
                    if ImageChops.difference(changed, out).getbbox() is None:
                        changed = ImageEnhance.Color(grade(out, note, salt=n + index + 1, strength=1.6)).enhance(1.3)
                out = Image.composite(changed, out, mask)
            return out
        if op == "backdrop":
            words = turn.backdrop.words if turn.backdrop else text
            place = scene(words, base.size, index)
            return Image.composite(grade(base, words, strength=.4), place, _mask(inputs.subject_mask, base.size, "figure"))
        if op == "remove":
            return Image.composite(base.filter(ImageFilter.GaussianBlur(base.width // 28)), base, _mask(None, base.size))
        if op == "angles":
            # a stand-in for the camera walking round them: the picture turned in perspective, the other way for the other side
            w, h = base.size
            k = (-.16, .0, .16)[index % 3]
            squeezed = base.resize((max(1, int(w * (1 - abs(k) * 1.6))), h)) if k else ImageOps.mirror(base).resize((int(w * .78), h))
            out = Image.new("RGB", (w, h), _palette(base, 1)[0])
            out.paste(squeezed, ((w - squeezed.width) // 2 + int(k * w * .6), 0))
            return out
        if op == "vary" or index:
            varied = grade(base, text, salt=index + 1, strength=1.2)
            zoom = random.Random(_seed(text, index)).uniform(1.0, 1.08)
            w, h = varied.size
            cw, ch = w / zoom, h / zoom
            return varied.crop(((w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2)).resize((w, h))
        changed = grade(base, text, strength=1.3)
        return changed if ImageChops.difference(changed, base).getbbox() else grade(base, text, salt=1)

    def turn(self, turn: Turn, inputs: Inputs, work: Work) -> None:
        op, rnd = turn.intent.op, random.Random(_seed(turn.id))
        total = DEFAULTS["simulator"][turn.pace] * OPS.get(op, 1.0) * (1 + (turn.n - 1) * .45)
        subject = inputs.subject or next(iter(inputs.pictures), "it")
        names = {"subject": f"@{subject}", "look": f"«{turn.look.name}»" if turn.look else "a new look", "n": turn.n,
                 "ref": next((f"@{h}" for h, role in inputs.refs if role == "style"), "the reference"),
                 "pictures": " and ".join(f"@{h}" for h in inputs.pictures) or "the pictures",
                 "place": f"«{turn.backdrop.name}»" if turn.backdrop else "somewhere new"}
        notes = NOTES.get(op, NOTES["edit"])
        work.stage("read")
        self._wait(work, total * .12)
        work.stage("plan")
        work.plan(PLANS.get(op, PLANS["edit"]).format(**names), turn.text)
        work.note(notes[0])
        self._wait(work, total * .14)
        work.stage("draw")
        pictures = [self.paint(turn, inputs, i) for i in range(turn.n)]
        for step, note in ((1, notes[1]), (2, notes[2])):
            self._wait(work, total * .22)
            work.note(note)
            for i, picture in enumerate(pictures):
                work.partial(i, _developing(picture, step))
            work.progress(step / 3)
        self._wait(work, total * .2)
        work.stage("finish")
        self._wait(work, total * .1)
        for i, picture in enumerate(pictures):
            work.result(i, stamp(picture), turn.text)
        voice = turn.room.voice if turn.room and turn.room.voice else ["Here it is."]
        work.reply(rnd.choice(voice), SUGGEST.get(op, SUGGEST["edit"]))

    def room(self, ask: RoomAsk) -> dict:
        text = ask.text.strip()
        raw: dict = {"name": " ".join(text.split()[:4]).title() or "A new room", "line": f"A room made from “{text[:80]}”.", "motifs": []}
        for pattern, patch in ROOM_WORDS:
            if re.search(pattern, text, re.I):
                for key, value in patch.items():
                    raw.setdefault(key, value)
                if patch.get("ornament"):
                    raw["motifs"].append(patch["ornament"])
        hue = _hue_in(text)
        if hue is None and ask.palette:
            r, g, b = (int(ask.palette[0][i:i + 2], 16) / 255 for i in (1, 3, 5))
            hue = round(colorsys.rgb_to_hls(r, g, b)[0] * 360)
        raw["colors"] = colours_for(_seed(text) % 360 if hue is None else hue, .5, bool(raw.get("dark")))
        return raw

    def look(self, ask: LookAsk, picture: Path | None) -> dict:
        raw = {"name": ask.text.strip().title()[:40] or "From a picture", "line": f"A look from “{ask.text.strip()[:60]}”." if ask.text.strip() else "A look lifted from a picture.",
               "prompt": ask.text.strip() or "the colours and light of the attached picture"}
        if picture is not None:
            raw["ramp"] = ["#%02x%02x%02x" % c for c in _palette(_open(picture, 256))]
        return raw

    def backdrops(self, ask: BackdropAsk, picture: Path | None) -> list[dict]:
        rnd = random.Random()
        ranked = sorted(PLACES, key=lambda p: (p[2] - ask.near) ** 2 + (p[3] - ask.dream) ** 2 + rnd.uniform(0, .05))
        ideas = [{"name": name, "words": words} for name, words, _, _ in ranked[:6]]
        if ask.text.strip():
            ideas = [{"name": ask.text.strip().capitalize()[:40], "words": ask.text.strip()}] + ideas[:5]
        return ideas
