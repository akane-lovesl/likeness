# Likeness

**Try a look on before you commit to it.**

Likeness opens on the **Lookbook**: a ring of faces that turns by itself, each changing one thing in a sweep of light. Curtain bangs, feathered brows, a copper colour, a bob. Touch a face to open it in the **mirror**, or bring your own.

The mirror reads your face on the device. A line of light passes down it, the parts a look can change are named in the margin (bangs, brows, eyes, lips, beard, colour, cut), and the face glances one way, then the other: drag it and it turns under your finger, there and then. Touch a part and the mirror leans in close to it; pick a style by its drawing, then shape it by hand. Drag its marks (the arch of a brow, a fringe down to the lashes, a bob to the shoulders, a colour a shade lighter) and the words for GPT Image write themselves as you go; add your own if you like. The change is sketched over your face first, and turns with it. Then **Try on**: GPT Image sends back four takes, made inside that part's mask and nowhere else. Scrub through them with a finger, hold the picture to see yourself as you were, keep the one you like, and ask for **every angle**: the frame turns under your finger, from one side round to the other.

It is a phone-shaped web app and a small studio server. Codex CLI with GPT Image makes the pictures, on your own machine.

## Three editions, never confused

| Edition | What makes the pictures | Label on every picture |
|---|---|---|
| **Showcase** | the device itself: looks are sketched over the face, never rendered (static files, no server) | Sketch |
| **Live · Simulator** | `likeness serve --engine simulator`: Pillow stand-ins, also stamped on the picture | Simulated |
| **Live · Workstation** | `likeness serve` with Codex CLI and GPT Image | Render |

The edition is in the header of every screen, and every picture says how it was made. A face turned on the device says so while it is turned. Every angle needs a studio: the showcase says so rather than pretending.

## Run it

The showcase needs only Node:

```
npm run serve                            # http://127.0.0.1:4173   (?desk opens straight on the desk)
```

The live studio needs Python 3.12 and [uv](https://docs.astral.sh/uv/):

```
uv sync
uv run likeness serve                    # Codex when the codex command answers here, otherwise the simulator
uv run likeness serve --engine simulator
uv run likeness probe codex [--smoke]    # is Codex here, signed in, and speaking every flag the studio uses?
uv run likeness examples                 # make the Lookbook's people through the engine (relay packet 0004)
```

`serve` prints a link for this machine and a pairing QR code for a phone on the same network. Scan it once and the phone stays paired.

## The Lookbook and the mirror

- **The ring.** Eight people who do not exist, rendered by GPT Image on the workstation (`relay/0004-lookbook`), three looks each. Drag it, or let it turn. Touch a part and the ring deals only that part's looks. Until the people are made, the ring holds drawings of each style, labelled as drawings.
- **The face, read on the device.** MediaPipe's face landmarker finds 478 points (`web/js/studio/face.js`). From them come the parts and their masks: where bangs fall, the brows, the eyes, the lips, a beard. A small hair segmenter finds the hair for a colour. Nothing is sent anywhere until you try something on.
- **Markup, then renders.** A style is drawn over your face from your own landmarks (`web/js/looks/markup.js`): bangs fall from your hairline, brows follow your brow bone, a wing leaves the corner of your eye, a colour is washed into your hair. A live studio then makes four takes in the app's own words for that style (`web/js/looks/vocab.js`), inside the mask, keeping everything else.
- **Shaped by hand.** A chosen part brings the mirror close (the picture and its markup, not the notes in the margin), and each style puts handles on its own markup (`controlsOf` in `web/js/looks/markup.js`): a brow's arch, fullness and tails; a fringe's length and parting; a cut's length and volume; a wing; a beard's length; a colour's shade. Dragged, the sketch reshapes live and says what it has become, in words taken from the face itself: a fringe *ending right at the brows*, a cut *resting on the shoulders*. Those words go to the studio after the style's own (`wordsFor`), so four takes come back shaped as drawn. Arrow keys move a focused handle; a double tap puts it back.
- **A face that turns, on the device.** The picture on show is laid over its own face mesh (`web/js/looks/turn.js`): the 478 points with their depth, smoothed so the cheek's edge stays clean; the hair and the head round them as two bands set behind the face, weighted by the hair segmenter so the hair comes round and the wall behind it stays straight; the frame's edge pinned. WebGL turns it a little either way, with a soft limit, the margin notes' lines follow their parts, and the stamp reads *Turned on this device* until it is back at rest. Without WebGL it simply does not turn.
- **Takes and angles.** Takes arrive one by one, each with the studio's estimate burning round it. Scrub, keep, hold to compare. *Every angle* asks for three more pictures of the one on show (`op: angles`): three-quarter from the right, profile, three-quarter from the left. They are turned through with a finger.
- **Stacking.** A change asked while a take is on show is made from that take, so bangs, then brows, then colour build on each other.

## The desk

Behind the Lookbook is the desk, where Likeness began: a studio you talk to.

- **Conversation, not menus.** Pictures get handles (A, B, …). `@` calls a picture, `#` a look, and the app reads what you mean as you type: change, restyle, reference, blend, pin, backdrop, variations, every angle.
- **Pins.** Tap part of a picture (an on-device segmenter selects it) and say what it should become.
- **Backdrops and trips.** *@A on a beach in Lisbon*, *put me on the moon*, *take @A to Paris, Kyoto and Mars*. The device paints the place, finds the person, and lights them by it.
- **Alive.** A picture the device painted moves while you look at it, and opens into depth. The sun can be held and dragged across the sky.
- **Rooms and today's sky.** The whole app dressed as a room you choose or invent from a sentence, with weather that resets each morning.
- **Honest waiting.** A draft at once, stages in the room's voice, previews, and a fuse burning toward an estimate learned on your machine. Stop works mid-turn.

## How a turn travels

```
app ── POST /api/assets ──────────────▶ studio     each picture once (masks too)
    ── POST /api/turns ───────────────▶            {text, handles, intent, pins, look, backdrop, room, pace, n} → {job, eta}
    ◀── GET /api/jobs/{id}/events ────             stage · note · plan · partial · result · reply · done | failed
    ── POST /api/jobs/{id}/cancel ────▶
    ── POST /api/rooms | looks | backdrops ─▶      words from the model, checked before they reach the app
```

A look tried on in the mirror is an `op: region` turn with `n: 4` and one pin, whose mask is the part's; a cut has no mask and is an `op: edit`. Every angle is `op: angles` with `n: 3`. The Codex engine runs one `codex exec --json` per turn in a job folder of its own under `private/jobs/`: the pictures and masks in `in/`, a brief (`likeness/brief.py`) that asks for a `PLAN` line, the pictures in `out/` and a `DONE` line, and Codex's event stream becomes the progress you see.

## The repository

```
web/                 the app: index.html, css/, js/ (core, looks, room, studio, ui), examples/, fonts/, vendor/ (MediaPipe)
likeness/            the studio: server.py, engines/ (simulator, codex), brief.py, examples.py, turns.py, rooms.py, jobs.py, store.py
studio.toml          the studio's defaults; private/studio.toml holds this machine's own answers
tests/               pytest (server, simulator, Codex engine against tests/fake_codex.py, examples, rooms, relay) and browser/ (Playwright)
relay/               hand-off packets for the workstation
tools/serve.mjs      the static server for the showcase
```

Checks: `npm run check` (types), `uv run pytest`, and `npm test` (Chrome at a 9:16 viewport, showcase and live simulator).

## Privacy

Your pictures, the studio's jobs, pairing keys and settings live in `private/`, which git ignores. The faces in the repository are the Lookbook's people, who do not exist (rendered by GPT Image from words), and the drawn test sitters in `tests/fixtures/sitters/`. The mirror reads a face on the device; a picture leaves it only when you ask a studio for something.
