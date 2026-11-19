# Likeness

**Try a look on before you commit to it.**

Likeness opens on the **Lookbook**: a ring of faces that turns by itself, each changing one thing in a sweep of light. Curtain bangs, feathered brows, a copper colour, a bob. Touch a face to open it in the **mirror**. Or touch the camera and the screen becomes one: your face, live, with the look sketched on it and following you as you move; the shutter takes that moment into the mirror.

The mirror reads your face on the device. A line of light passes down it, the parts a look can change are named in the margin (bangs, brows, eyes, lips, beard, colour, cut), and the face glances one way, then the other: drag it and it turns under your finger, there and then. Touch a part and the mirror leans in close to it; pick a style by its drawing, then shape it by hand. Drag its marks (the arch of a brow, a fringe down to the lashes, a bob to the shoulders, a colour a shade lighter) and the words for GPT Image write themselves as you go; add your own if you like. The change is sketched over your face first, and turns with it. Then **Try on**: GPT Image sends back four takes, made inside that part's mask and nowhere else. While it works the frame shows it: a light passes over the part, the studio's own words come up with an honest time left, and its previews develop inside the part only, stamped as previews. Scrub through them with a finger, hold the picture to see yourself as you were, keep the one you like, and ask for **every angle**: the frame turns under your finger, from one side round to the other.

It is a phone-shaped web app and a small studio server. Codex CLI with GPT Image makes the pictures, on your own machine.

## Three editions, never confused

| Edition | What makes the pictures | Label on every picture |
|---|---|---|
| **Showcase** | the device itself: looks are sketched over the face, never rendered (static files, no server) | Sketch |
| **Live · Simulator** | `likeness serve --engine simulator`: Pillow stand-ins, also stamped on the picture | Simulated |
| **Live · Workstation** | `likeness serve` with Codex CLI and GPT Image | Render |

The header identifies the edition. Example portraits carry their source in the catalog and show it in the mirror. The mirror also shows when a face turns on the device. Every angle uses the connected studio.

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
npm run tour -- --url http://127.0.0.1:8787   # the whole product used end to end at a phone's size, filmed into storyboards
```

`serve` prints a link for this machine and a pairing QR code for a phone on the same network. Scan it once and the phone stays paired.

On the workstation, Codex sets all of this up: `relay/START.md` is the hand-off, from installing to the phone.

## The Lookbook and the mirror

- **The ring.** Eight people who do not exist, rendered by GPT Image on the workstation (`relay/0004-lookbook`), three looks each. Drag it, or let it turn. Touch a part and the ring deals only that part's looks. Their faces are read on the device as the ring comes in, so each card closes on the head and leans in on the part it changes, the look sweeping in close; words typed are drawn on the real face as said, and the card says *Sketch* until they are gone. Until the people are made, the ring holds the drawn sitters (invented people, drawn, in `web/sitters/`), each wearing a look the device sketches on with the mirror's own strokes and colours, labelled as drawings. The one in front leans in on the part it changes and draws the look on stroke by stroke; while you stay with it, it tries that part's other styles on. Their faces and hair are read once by `npm run sitters` (`tools/sitters.mjs`: the segmenter's hair, grown through the drawing's own colours into a bob or a bun it missed, kept off the skin, the face and a beard, and cut free of shelves and hedges of the same colour), so the first screen needs no model and every sitter can take a colour. Touch a sitter and it opens in the mirror wearing the look; *On me* puts it on your own face.
- **Words that shape.** What you type is read the way a stylist hears it (`web/js/looks/words.js`): *curtain bangs, a lot longer, parted left* names the look and moves the same handles a finger drags, so it is drawn as it is written. On the Lookbook the ring turns to a face wearing what you name and the strokes glide into the shape you describe, the words under it saying what they did (*to the jaw · parted left*); left alone, the line says something by itself and the ring acts it out, one face after another. In the mirror the words pick the look, shape it and take the mirror close to each part they mention; delete them and what they asked for goes. Press go with no photo and the camera opens with the look already on.
- **The live mirror.** The camera (in the ask bar, *On me* on a drawn style, or *On me* in the mirror) opens the front camera as a mirror (`web/js/looks/live.js`). MediaPipe follows the face in video mode. Where the device has a core to spare it reads in a worker beside the page, so the mirror is drawn at the camera's own pace and the face is carried on between readings; otherwise it reads on the page between frames (on the CPU where the graphics are drawn in software, which is faster there). The picked looks are drawn on it every frame: the same markup as the mirror's, the lips tinted, a colour laid over the hair the segmenter finds a few times a second (never on the brows, or on a beard: a chin far darker than the cheeks keeps a new colour off the lower face all round, sideburns too, while hair beside a beardless jaw keeps it). Touch a part and the picture comes apart into every style of it at once, each tile close on that part of your live face; touch one and the others fall away as it closes back round you wearing it. Swipe across the face for the next style. The frame says *Live sketch · on this device*. The shutter keeps that moment as a photo, the way you saw yourself, and hands it to the mirror with the face it had just read, so the look is on it at once. With no camera, or no permission, a photo instead.
- **Every side of you.** The button beside the shutter (it says what it does the first time you turn your head) puts a level under your face: a dot that goes where your nose does, and a mark for straight on and for each side. Turn slowly and each is caught as you pass it, with the look drawn on it and the hair read again in that very frame, so its new colour is where the hair is. With all three, the mirror opens on the front and turns through your real angles once, then lets you drag round them. Between two sides the head turns on the device: each side is turned towards the next on its own face mesh (`web/js/looks/turn.js`) until they meet half-way, so it is one head turning rather than one picture fading into another. The studio's angles turn the same way wherever their faces can be read. The pictures are three moments of your own camera; only the frames between them are made on the device.
- **The ring becomes you.** Once a photo of you is kept (the shutter, every side of you, or a photo chosen), the ring deals its looks again, on you: each card a sketch on your photo (stamped *Sketch*), the line acting its sayings out on your face, and a card touched opens your photo in the mirror wearing that look. *Them · You* in the bar goes back and forth; on a later visit you are offered there, not shown. Your face is read and your hair found on the device (the beard and the brows left out), and none of it leaves the device.
- **Show it.** On your own photo, *Show* makes the mirror something to show the person who will cut it: the tools fall away, the picture comes forward (turning slowly through every side of you, or swaying a little on the device and saying so), and the look is set under it in its words. *Save the card* draws it all as one picture, 1080 × 1350, on the device and hands it to the phone's share sheet, or downloads it; its foot says what each picture is.
- **The face, read on the device.** MediaPipe's face landmarker finds 478 points (`web/js/studio/face.js`). From them come the parts and their masks: where bangs fall, the brows, the eyes, the lips, a beard. A small hair segmenter finds the hair for a colour. Nothing is sent anywhere until you try something on.
- **Markup, then renders.** A style is drawn over your face from your own landmarks (`web/js/looks/markup.js`): bangs fall from your hairline, brows follow your brow bone, a wing leaves the corner of your eye, a colour is washed into your hair the way a dye takes: most of the way to the colour's own lightness (platinum lifts black hair, copper deepens grey), then its hue, keeping the hair's own light and shade (`web/js/looks/tint.js`). A live studio then makes four takes in the app's own words for that style (`web/js/looks/vocab.js`), inside the mask, keeping everything else.
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
relay/               the hand-off to the workstation: START.md, then the packets
tools/serve.mjs      the static server for the showcase
```

Checks: `npm run check` (types), `uv run pytest`, and `npm test` (Chrome at a 9:16 viewport, showcase and live simulator).

## Privacy

Your pictures, the studio's jobs, pairing keys and settings live in `private/`, which git ignores. The faces in the repository are the Lookbook's people, who do not exist (rendered by GPT Image from words), and the drawn sitters in `tests/fixtures/sitters/` (the Lookbook wears them too, from `web/sitters/`). The mirror reads a face on the device; a picture leaves it only when you ask a studio for something. The live mirror's camera is read frame by frame on the device and nothing of it is kept but a photo you take.
