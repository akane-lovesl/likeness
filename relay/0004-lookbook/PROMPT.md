# 0004 · The Lookbook's people

**Make the faces the app opens on, with GPT Image, and judge every one before it is committed.**

You are Codex, working in the Likeness repository on the user's own computer, after packet 0003 (the Codex studio works here). Read the whole prompt before starting.

## Why

Likeness opens on the **Lookbook**: a ring of faces that turns by itself. On each face one thing changes in a sweep of light (curtain bangs, feathered brows, a copper colour, a bob) and its name sits underneath. Touch a face and the **mirror** opens on it: the takes of that look, and every angle of it. Then *On me* brings in your own photo, the mirror reads the face on the device, and the same change is tried on you: four takes from GPT Image, scrubbed with a finger, one kept, then turned to every angle.

The Lookbook is only as good as its faces. Until now it has shown drawings (the drawn sitters, with looks sketched on them), because nothing in the repository may be a picture of a real person. So the faces must be **people who do not exist**, rendered by GPT Image here, and good enough that someone opening the app wants to try a look on.

## What to make

`relay/0004-lookbook/cast.toml` describes eight invented people (age, skin, hair, a backdrop colour) and, for each, three looks from the app's vocabulary (`web/js/looks/vocab.js`). `uv run likeness examples` (`likeness/examples.py`) makes them through the studio's own engine, one turn at a time, exactly as the app's turns are made:

1. **A portrait**: an `op: create` turn from the cast's words.
2. **Each look**: an `op: edit` turn on the portrait, in the app's own words for that style: *"Give them curtain bangs, parted in the middle, sweeping softly out to the cheekbones. Keep everything else exactly as it is: the same person, face, expression, skin, light and background."*
3. **Every angle of the first look**: one `op: angles` turn with `n: 3` (three-quarter from their right, profile, three-quarter from their left; *only the camera moves*).

Each picture is cut to 768 × 1024 (3:4, leaning to keep the top of the head) and saved as WebP under `web/examples/<person>/`. `web/examples/manifest.json` is rewritten after each person, with `"kind": "render"`. The app reads it on start; the drawn sitters step aside when at least three looks are there.

The stage runs it: `uv run likeness relay run 0004`. It is 56 pictures and may take a few hours. Stopped or failed, run it again: what is already on disk is kept. To make one person or one picture again, delete the file (or the person's folder) and run `uv run likeness examples --engine codex --only <id>`.

## Look at every picture

This is the real job: the stage only proves that pictures came back. Open each one and judge it as the person opening the app would. Make again whatever falls short:

- **The same person** across the portrait, the three looks and the three angles: the face, the skin, the eyes, the expression and the clothes. A look that changes who they are is a failure, however good the hair.
- **Only the part asked for changes.** Curtain bangs must not also recolour the hair; a red lip must not restyle the brows.
- **The look reads at a glance** at card size (about 230 pixels wide on a phone). If curtain bangs are too subtle to see, the look is not doing its job: ask again with stronger words (in `cast.toml` or `vocab.js`; keep the app and the cast in step, the tests check that).
- **Believable photographs**: real skin texture, hair with strands, sensible light; no waxy skin, no extra fingers, no text, no watermark. The whole head in frame, space above it.
- **The angles turn**: three-quarter right, profile, three-quarter left, the same light, the same backdrop, the look kept. They are cross-faded in the mirror as the finger turns, so a matching backdrop matters.
- **Range**: the eight should differ in age, skin and hair, as the cast says. If GPT Image drifts toward one kind of face, say so in the words.

You may change the cast's words, the portrait direction (`[style]` in `cast.toml`), the briefs (`likeness/brief.py`) or `likeness/examples.py` if that is what it takes. Keep `tests/test_examples.py` honest.

## Then try it as the user will

1. `uv run likeness serve`, and open it in Chrome at a phone size.
2. The Lookbook: the ring turns, each look sweeps across its face, the names read well. Turn it with a finger. Touch a part (Bangs, Brows…) and the ring deals only those looks.
3. Touch a face: the mirror opens on it, with its looks as takes and every angle of the first. Drag across the frame to turn it.
4. **On me**, with a drawn sitter from `tests/fixtures/sitters/` (never a photograph of a real person; where there is a camera, *On me* opens the live mirror, and the picture button beside its shutter chooses a photo instead): the face is read (a line of light, its points, its outlines, then the parts named in the margins). Pick *Bangs → Curtain*, add a few words, **Try on**. Four takes come back as GPT Image renders, inside the bangs' mask (`op: region`, one pin, the mask from `web/js/studio/face.js`). Scrub them, keep one, then **Every angle**: three more, and the frame turns.
5. Drag a face sideways in the mirror, a portrait and one of its looks: it turns on the device (WebGL over the face's own mesh, `web/js/looks/turn.js`), the stamp reads *Turned on this device*, and it springs back to the picture itself. These photoreal faces are what it was made for, so judge it on them: the cheek's edge stays clean, the hair comes round with the head, the wall behind stays straight. Where it tears or swims, tune `meshOf` (the bands' reach and depth) or the soft limit in `mirror.js`, and say what you changed and why.
6. Shape a look by hand before trying it on: a part chosen brings the mirror close; drag its handles (a brow's arch, a fringe's length) and watch the words write themselves on the line. Try it on and judge whether the four takes follow those words (`pins[0].note` in the turn carries them). Where GPT Image misreads a phrase, change the words in `web/js/looks/markup.js` (`say(...)`) rather than the drawing.
7. Do the same with an example portrait (the mirror brings it in as a picture when a change is asked of it): this is the closest thing to a real face that may be used.
8. Words: on the Lookbook type *curtain bangs, a lot longer, parted left* and watch the ring turn to it and the strokes move; open it, and in the mirror type *a bit shorter and a red lip*. Then **Try on**: the studio is sent the look's own words and what the shape says (`said` in `mirror.js`). Say whether GPT Image follows the shape words (length, parting, arch, shade) or ignores them, with an example of each.
9. The live mirror, with a camera that plays a drawn sitter: start Chrome with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=tests/fixtures/camera/kofi.mjpeg` and touch the camera on the Lookbook. The look is sketched on the face, the frame says *Live sketch · on this device*, a swipe changes the style, touching a part opens every style of it as tiles of the live face (touch one to wear it), and the shutter takes that moment into the mirror with the look already on it. Try *Colour* on a real head of hair too: platinum should lift dark hair, copper should deepen grey, and none of it should spill onto the skin or the wall. Say whether it keeps up on this machine (the live view's `data-read` is how long a face read took, in milliseconds). Then **Every side of you**, with `tests/fixtures/camera/kofi-turn.mjpeg` as the camera (a drawn sitter turning his head) and then with your own camera: the button beside the shutter, then turn slowly. Say whether the dot follows the nose the right way, whether each side is caught without having to hold still for long, and whether the mirror's turn through the three looks like one head turning.

Fix what you find. Change the app if it needs it; the house rules are in `AGENTS.md`.

## Ground rules

- **Nothing personal is committed.** These are invented people. No photograph of a real person, nothing made from one, no tokens, no pairing keys. `private/` stays ignored.
- **Three editions, labelled honestly.** The examples are renders, and say so (`"kind": "render"`). Never put simulated or sketched pictures in `web/examples/`.
- **Keep the studio protocol stable** (top of `likeness/server.py`, client in `web/js/studio/remote.js`). Change both sides and the tests together if you must.
- **No GitHub Actions workflow files.**
- Run `uv run pytest` and `npm test` before you push. One Chrome at a time.
- Commit `web/examples/` (the WebP files and `manifest.json`) and any code you changed. About 4 to 6 MB of pictures is expected; if it is much more, lower the WebP quality in `likeness/examples.py` rather than the size.
- Push to the `studio` branch of https://github.com/akane-lovesl/likeness. Never to `main`.

## Report

Leave `relay/0004-lookbook/REPORT.md` for the user (git ignores it): what was made, how long it took per kind of turn (`out/examples.json` has the times), what you made again and why, what you changed, and three contact sheets (portraits; looks; angles) saved beside it as pictures.
