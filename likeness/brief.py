"""The words the studio's model is given, kept in one place so they can be tuned without touching the plumbing.

Every brief asks for the same three milestones, so the app can show progress honestly:
  PLAN {json}    as soon as the model knows what it will do
  (the pictures, saved to out/1.png, out/2.png, ...)
  DONE {json}    a short reply in the room's voice and three ideas for what to try next
  FAILED {json}  instead, when it cannot
"""

from __future__ import annotations

from .turns import Inputs, Turn

ROLE = {
    "style": "a style reference: borrow its palette, light and texture, not its content",
    "backdrop": "a place: use it as the new background",
    "with": "another picture to work with",
}
OPS = {
    "create": "Paint a new picture from the words.",
    "edit": "Change the subject picture as the words say. Keep everything the words do not mention: the same people, faces, poses and composition.",
    "restyle": "Repaint the subject picture in the look described below. Keep its composition, its people and what it shows.",
    "reference": "Change the subject picture so it takes on the style reference's palette, light and texture. Keep the subject's composition and content.",
    "blend": "Combine the pictures into one, as the words say.",
    "region": "Change only the marked regions of the subject picture, each as its note says. Leave everything outside the masks exactly as it is.",
    "backdrop": "Replace the background behind the subject with the place described below. Keep the subject exactly, and match the light to the new place.",
    "remove": "Remove what the words (or the marked regions) point at, and fill the space so nobody could tell.",
    "vary": "Make variations of the subject picture: the same subject, different takes on it.",
    "angles": ("Show the person in the subject picture from other angles, one picture each, in this order unless the words say otherwise: "
               "three-quarter view with the nose pointing toward the right edge, full profile toward that same edge, "
               "then three-quarter view with the nose pointing toward the left edge. Keep them exactly: the same face, hair, "
               "make-up, clothes, light and backdrop. Only the camera moves."),
}
PIN_MARKS = "①②③④⑤⑥⑦⑧⑨"


def turn_brief(turn: Turn, inputs: Inputs, files: dict[str, str], *, size: str, quality: str, image_hint: str) -> str:
    """The brief for one turn. files maps each picture's handle (and mask names) to its path inside the job folder."""
    lines = ["You are the studio hand of Likeness, a personal image studio. Work only inside the current folder.", ""]
    lines += ["The person wrote:", f"«{turn.text.strip() or '(no words; see the instructions below)'}»", ""]
    if inputs.pictures:
        lines.append("Pictures (also attached to this message, in this order):")
        for handle in inputs.pictures:
            role = "the subject: the picture to change" if handle == inputs.subject else ROLE.get(dict(inputs.refs).get(handle, "with"), ROLE["with"])
            lines.append(f"- {handle} = {files[handle]}: {role}")
        lines.append("In the person's words, @A means picture A, and so on.")
        lines.append("")
    lines.append("What to do: " + OPS.get(turn.intent.op if inputs.pictures else "create", OPS["edit"]))
    for n, note, _mask in inputs.pins:
        mask = files.get(f"pin{n}")
        lines.append(f"- Region {PIN_MARKS[n - 1]} ({mask}; white = change, black = keep): {note or 'change this'}")
    if files.get("edit"):
        lines.append(f"- The same regions as one edit mask, in the convention image-edit tools expect (transparent = change): {files['edit']}")
        if turn.intent.op == "region":
            lines.append("Keep the source crop, scale and alignment so the edited areas line up. The studio composites them onto the original. Do not resize or composite the tool's output yourself.")
    if inputs.subject_mask is not None:
        lines.append(f"- The subject to keep is marked in {files['subject']} (white = keep in front).")
    if turn.look:
        lines.append(f"Look: «{turn.look.name}»: {turn.look.prompt}")
    if turn.backdrop:
        lines.append(f"New place: «{turn.backdrop.name}»: {turn.backdrop.words}")
    if turn.taste.strip():
        lines.append(f"Their standing taste (follow it unless the words above say otherwise): «{turn.taste.strip()}»")
    if turn.room and turn.room.name:
        lines.append(f"(For taste only: the person is working in a room called «{turn.room.name}», {turn.room.line})")
    lines += ["", f"Make {turn.n} picture{'s' if turn.n > 1 else ''}, {size}, quality {quality}.", "",
              "How to work:",
              '1. First reply with one line: PLAN {"summary": "<one short sentence: what you will do>", "prompt": "<the image prompt you will use>"}',
              f"2. Make the picture{'s' if turn.n > 1 else ''}. {image_hint}",
              "3. If the image tool saves the PNG files itself, leave them where it saves them. The studio collects those files in generation order. "
              "Otherwise write only these PNGs: " + ", ".join(f"out/{i + 1}.png" for i in range(turn.n)) + ".",
              f'4. Last, reply with one line: DONE {{"reply": "<one or two warm sentences to the person, in this voice: {", ".join(turn.room.voice[:3]) if turn.room and turn.room.voice else "warm, brief, precise"}>", "suggestions": ["<three short things they might ask next, at most five words each>"]}}',
              'If it cannot be done, reply with one line instead: FAILED {"message": "<why, plainly>", "hint": "<what the person could change>"}',
              "Do not ask questions; decide. Do not change files outside out/."]
    return "\n".join(lines)


def room_brief(text: str, palette: list[str] | None) -> str:
    extra = f" Use these colours from a picture as the starting point: {', '.join(palette)}." if palette else ""
    return (f"Invent a room for the Likeness app, from this vibe: «{text}».{extra}\n"
            "A room is the app's whole atmosphere: colours, type, ornaments, scenery, weather, the wipe used to enter it, its little sounds, how it moves, and how its studio talks.\n"
            "Colours are #rrggbb. ground and ground2 are the background (light rooms: pale; dark rooms: deep). surface is for cards; ink must read clearly on surface; soft is for quieter text; accent and accent2 are the highlights.\n"
            "Voice lines are short, warm and in character; placeholder is at most 24 characters; send is one short word.\n"
            "Answer with JSON only, matching the schema.")


def look_brief(text: str, has_picture: bool) -> str:
    source = "the attached picture's look" if has_picture and not text else f"«{text}»" + (" (the attached picture shows the look)" if has_picture else "")
    return (f"Describe a look (an image style) for Likeness from {source}.\n"
            "name: two or three words. line: one evocative sentence. prompt: the style instructions an image model should follow, one line.\n"
            "ramp: five #rrggbb colours from deepest shadow to brightest light. keep: 0 to 1, how much of a picture's own colour survives. grain, bloom, vignette: 0 to 1.\n"
            "Answer with JSON only, matching the schema.")


def backdrops_brief(text: str, near: float, dream: float, room: str, has_picture: bool) -> str:
    return ("Suggest six backdrops (new places to stand in) for " + ("the attached picture" if has_picture else "a portrait") + ".\n"
            + (f"The person asked for: «{text}». Start with that, then variations.\n" if text else "")
            + f"Lean {'close-up and intimate (rooms, walls, windows)' if near < .4 else 'wide and far (landscapes, skylines)' if near > .6 else 'between close and far'}, "
            + f"and {'real and photographic' if dream < .4 else 'dreamlike and impossible' if dream > .6 else 'between real and dreamt'}.\n"
            + (f"The person is working in a room called «{room}»; let that colour the ideas a little.\n" if room else "")
            + "Each backdrop: name (at most five words) and words (one vivid line an image model can paint).\nAnswer with JSON only, matching the schema.")
