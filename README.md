# Likeness

**A personal image studio you talk to.**

Bring pictures and words and say what you want: *"Use @B as a reference and make @A look like it."* Pin the part of a picture you mean and say what it should become. Ask for a backdrop and choose from ideas made for that picture. Dress the whole app as a room (Little Princess, Noir, Riviera, or one you invent from a sentence: *"take me to a rainy Tokyo jazz bar at midnight"*) and let today's sky set the weather.

It is a phone-shaped web app and a small studio server. Codex CLI with GPT Image makes the pictures, on your own machine.

## Three editions, never confused

| Edition | What makes the pictures | Label on every picture |
|---|---|---|
| **Showcase** | the device itself, as quick sketches (static files, no server) | Sketch |
| **Live · Simulator** | `likeness serve --engine simulator`: Pillow stand-ins, also stamped on the picture | Simulated |
| **Live · Workstation** | `likeness serve` with Codex CLI and GPT Image | Render |

The edition is in the header of every screen, and every picture says how it was made.

## Run it

The showcase needs only Node:

```
npm run serve                            # http://127.0.0.1:4173
```

The live studio needs Python 3.12 and [uv](https://docs.astral.sh/uv/):

```
uv sync
uv run likeness serve                    # Codex when the codex command answers here, otherwise the simulator
uv run likeness serve --engine simulator
uv run likeness probe codex [--smoke]    # is Codex here, signed in, and speaking every flag the studio uses? --smoke makes two pictures
```

`serve` prints a link for this machine and a pairing QR code for a phone on the same network. Scan it once and the phone stays paired; other devices get a polite refusal.

## What it does

- **Conversation, not menus.**
  - Pictures get handles (A, B, …). Type `@` to call a picture and `#` to call a look.
  - While you type, the app reads what you mean (change, restyle, use as a reference, blend, pin, backdrop, variations) and shows it with a time estimate before you send.
  - In the showcase, a small proof rises behind the composer and sketches what you are asking for, painted again as the words change. Tap it for another arrangement; the picture you send for is the one it showed.
  - Every reply ends with three ideas for what to say next.
  - On the device, a sketch does what it honestly can to any picture (warmer, brighter, black and white, a plain or transparent background, a profile picture around the face, a crown or a cape) and says plainly when something needs the studio, rather than pretending.
  - A sketch the device made can be talked to: *make it night*, *add a rabbit in a crown* or *two more like this* paints the same scene again, with just that changed.
- **The sun.** On a sketch the device made, the sun can be held. Drag it across the sky and the scene is painted again under your finger: first light low on the left, the golden hour low on the right, and night once it goes under the horizon, when the moon rises across the sky. Indoors, the window's light moves across the table. Let go, and it offers to paint it at that hour.
- **The look camera.** Point the camera and see the world in any look, sketched live on the device. Take the picture, and the studio paints it in that look.
- **Pins.** Tap part of a picture and an on-device segmenter (MediaPipe) selects it, or paint it with a finger. Each pin gets its own note, and only those parts change. On the device, a note that names scenery (*a starry night with the northern lights*, *a stormy sea*) is painted into the pin.
- **Looks.** Styles as data: a prompt for the model, plus a recipe the device can sketch at once. Make your own from words or from a picture. On the device, Watercolour is a medium rather than a tint: flat, transparent washes in the picture's own colours, pooled at their edges over a pencil drawing, on paper that shows through at ragged margins.
- **Backdrops.** Not a hundred presets. The studio suggests places for *this* picture, and two dials move the ideas between near and far, and between real and dreamt. Or just say where: *@A on a beach in Lisbon*, *put her in front of a lighthouse at sunset*, *@A underwater*, *above the clouds at sunset*. *Put me on the moon* comes with a helmet, since there is no air up there (unless you say *without a helmet*), and the Earth hangs in a sky that stays black at every hour. On the device, the segmenter finds who the picture is of, and the proof shows them there before you send.
- **Dressing up.** *Make @A a superhero* gets a cape, the city at night and a light along the outline. An astronaut, a king or queen, a wizard, a witch, an angel, a fairy and a little devil each come with their own pieces. Or ask for one piece at a time: *give her a crown and a blue cape*. On the device the pieces are painted on, placed by the outline the segmenter found (the top of the head, its width, the neck, the shoulders), and the reply says what was painted. The studio on a workstation paints the whole costume.
- **Rooms.** A room is the whole atmosphere:
  - colours, typefaces, frames and ornaments;
  - a set piece and a texture;
  - weather, small sounds and motion;
  - the voice the studio talks in, and the wipe that carries you in.

  Seven are built in. Invent more from a sentence or a picture: the device reads the sentence cue by cue (places, settings, styles, things, people, seasons, weather, times of day, moods and colours), shows what it heard, and composes the room, name, voice and sparks included. *"Another take"* settles its close calls another way. Or say it in the composer: *"take me to my grandmother's kitchen in Lisbon"*. After you paint a place, the first idea is *Take me there*.
- **Today's sky.**
  - A mood sets the weather and light for the day, and it resets at dawn.
  - If you switch it on, the weather outside comes in: your rounded position goes to open-meteo.com, and nothing else leaves the device.
  - Each room offers three new sparks to start from every day.
- **Memory.**
  - Every picture remembers how it was made. Open it to see the chain of asks that led there, and hold it to compare with the one before.
  - On the device, a picture made from your photo keeps its recipe: where you were put, what you wear, the hour, the look. Ask for more (*make him a superhero*, *without the helmet*, *somewhere else*) and it is made again from the photo, never cut out of a cut-out. The sun can be held there too: drag it and the place relights around you.
  - A standing note of your taste travels with every request.
- **Honest waiting.**
  - A draft is sketched on the device at once, from the same reading of your words that invents rooms: a jazz bar gets its neon sign, a Lisbon kitchen its tiles, lavender its rows. In the showcase you watch a new one painted layer by layer, each named as it goes down. A photo you brought shows its making too: it is on the card while your words are read, the person in it is outlined once the device finds them, and the new place is painted in behind them. A watercolour starts as a pencil drawing.
  - Stages are named in the room's voice, and the model's own notes appear as it thinks.
  - Previews come in, and a fuse burns toward an estimate learned on your machine.
  - Stop works mid-turn, and reloading the page picks a turn up again.
- **Pace.** Quick, Fine and Deep. Each one is a model, a reasoning effort and an image quality, set in `studio.toml`.

## How a turn travels

```
app ── POST /api/assets ──────────────▶ studio     each picture once (masks too)
    ── POST /api/turns ───────────────▶            {text, handles, intent, pins, look, backdrop, room, pace, n} → {job, eta}
    ◀── GET /api/jobs/{id}/events ────             stage · note · plan · partial · result · reply · done | failed
    ── POST /api/jobs/{id}/cancel ────▶
    ── POST /api/rooms | looks | backdrops ─▶      words from the model, checked before they reach the app
```

The Codex engine runs one `codex exec --json` per turn, sandboxed in a job folder of its own under `private/jobs/`:

- **Inputs.** The pictures go in `in/`, named by their handles, with the masks beside them.
- **Instructions.** The brief (`likeness/brief.py`) asks for a `PLAN` line, then the pictures in `out/`, then a `DONE` line.
- **Progress.** Codex's event stream becomes the progress you see.
- **Rooms, looks and backdrop ideas.** These are words only. They use `--output-schema` with strict schemas, and `likeness/rooms.py` normalises whatever comes back.

## The repository

```
web/                 the app: index.html, css/, js/ (core, room, studio, ui), fonts/, vendor/ (MediaPipe)
likeness/            the studio: server.py, engines/ (simulator, codex), brief.py, turns.py, rooms.py, jobs.py, store.py, estimates.py
studio.toml          the studio's defaults; private/studio.toml holds this machine's own answers
tests/               pytest (server, simulator, Codex engine against tests/fake_codex.py, rooms) and browser/ (Playwright)
relay/               hand-off packets for the workstation
tools/serve.mjs      the static server for the showcase
```

Checks: `npm run check` (types), `uv run pytest`, and `npm test` (Chrome at a 9:16 viewport, showcase and live simulator).

## Privacy

Your pictures, the studio's jobs, pairing keys and settings live in `private/`, which git ignores. The only faces in the repository are the drawn test sitters in `tests/fixtures/sitters/`.
