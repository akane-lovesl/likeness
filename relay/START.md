# Start here · the hand-off

**Everything Likeness needs from this computer, as one job: install it, wire it to Codex and GPT Image, make the Lookbook's people and put them in the app, prove every feature with real pictures, and the phone last.**

You are Codex, on the user's Windows computer, and the user has asked you to carry out this file. It is the whole job, in order. Two packets beside it hold the detail of their parts: `relay/0003-codex-studio/PROMPT.md` and `relay/0004-lookbook/PROMPT.md`. Read this file to the end before starting, then each packet when you reach it.

Most of it is yours to do without asking. Where a prompt and reality disagree, believe reality, change the code, and keep the tests honest. The user wants to come back to a studio that works here, beautifully, and to a short, plain account of what was done. It is a long job (the pictures alone take hours), so commit and push as you go. If you are picking it up again, `git log` and the reports show where it got to.

## New since your last run (2026-11-20): the portrait studio

The user tested the app on their phone and asked for a rethink: it should lead with artistic styles, not facial parts; the themes should be seen; the keyboard must stop squashing the page; controls must be roomy, undoable and easy to get back from; waiting must always say what is happening; nothing may be lost. It was rebuilt around that here, and checked in the showcase, on the simulator, and with real GPT Image pictures (through the OpenAI API, from this side). What it is now:

- **The styles come first** (`web/js/portrait/`). The app opens on eight styles (Little Princess, Storybook, Anime, Old Master, Neon City, Pop Art, Woodblock, Clay) and one of your own. Each is a portrait of one of the Lookbook's invented people in that style's own frame, beside the photo it came from (`web/styles/`, GPT Image renders made by `tools/styles.mjs` from the exact words the app sends). The whole app wears the style in front: each style has a room (six new ones in `web/js/room/rooms.js`). The first visit opens on Little Princess, pink.
- **Painting a portrait** is three steps with a way back from each (the phone's back gesture too, `web/js/core/nav.js`): the photo, *Style it* (palette, mood, details, backdrop, format, likeness, your words; undo and redo for every choice), then the painting (a sketch drawn on the phone at once, labelled as one, then the studio's stages, an honest time left, partial pictures, Stop). The turn is an ordinary `restyle` turn, with one new optional field, `aspect` (portrait, square, tall).
- **Nothing is lost.** Every portrait is kept in IndexedDB the moment it is asked for (`web/js/portrait/keep.js`); one left painting is resumed after a reload; **Mine** shows portraits and conversations; `GET /api/history` lists what the studio made for this device, so the phone can show what it no longer holds; *your space* has a name, durable storage and a backup file. This is the groundwork for accounts: data is already kept per paired device.
- **The keyboard.** The stage's height is held at the screen's height without the keyboard (`web/js/core/keyboard.js`, `--app-h`), and new text fields open at the top of the screen.
- **A faster engine, optional:** `--engine openai` (`likeness/engines/openai_images.py`) calls the OpenAI Images API directly, streamed: about ten seconds a portrait here, against about a minute through Codex. It needs `OPENAI_API_KEY` and bills the user's OpenAI account, so it is never chosen automatically.
- The Lookbook and the mirror are unchanged, at `?looks`; the desk is the *Studio* tab.

What to do, before or alongside the parts below (they still hold):

1. **Checks.** `git pull`, `npm ci`, `uv sync`, then the three checks. Here: 51 pytest and 69 browser tests.
2. **Every style, really painted, through Codex.** Serve the studio with the Codex engine, open the app, and paint one of the sample faces in each of the eight styles at Fine, and once as an avatar. Compare each with `web/styles/<style>/*.webp`, made by `gpt-image-2.6-sunburst` at high quality from the same words. Where Codex's picture strays (a frame or lettering drawn in, a different face, the style too weak), first find out why from the job folder; then tune the words in `web/js/portrait/styles.js` (`promptFor`) or the brief, whichever is at fault. Remember that `tools/styles.mjs` made the examples from those words, so a change of words wants the examples made again. That is the user's call, as it costs API money.
3. **Times.** Note how long each style takes at each pace through Codex. The app's estimate learns them by itself (`private/estimates-codex.json`); make sure the first wait it shows is honest.
4. **The direct engine, only if the user wants it.** Ask first. If yes, put the key in the environment, or in `private/openai.key` with `[openai].key_file` in `private/studio.toml`; never in the repository. Run `uv run likeness serve --engine openai`, paint the eight styles again, compare speed and quality with Codex, and set `[studio].engine` in `private/studio.toml` to the user's choice. Partial pictures: `gpt-image-2.6-flare` sent none at low quality in the test here; see whether medium or the sunburst model sends them, and keep `partials` in `studio.toml` honest.
5. **On the phone (Part 6), in this order:**
   - The keyboard: open *Anything else?* while styling, and the Studio tab's composer. The page must neither shrink nor jump.
   - The back gesture through photo → Style it → painting, and out to the styles.
   - Swiping the styles must feel smooth. If the wipe on each settle stutters on the phone, `changeRoom` in `settle()` (`web/js/portrait/home.js`) is the first suspect.
   - The selfie button opens the front camera.
   - Share hands the picture to the phone's share sheet.
   - `npm run build`, so the phone gets the bundle.
6. **The tour** (`npm run tour`, Part 5) does not yet film the portrait studio. Add its scenes first: the styles, the photo, Style it, the painting, the result, Mine.

## What Likeness is

A personal image studio, phone-shaped. It has two halves: a web app (`web/`: plain HTML, CSS and ES modules on a 9:16 stage, no build step) and a small studio server (`likeness/`, FastAPI) that runs Codex for the pictures.

- **The Lookbook.** It opens on a ring of faces that turns by itself. Each face wears a look (bangs, brows, lashes, lips, beard, colour, cut) that sweeps across it in light. Typing *curtain bangs, a lot longer, parted left* turns the ring to that look and reshapes the strokes.
- **The mirror.** Touch a face and the mirror opens on it. The face is read on the device and its parts are named. You choose a look by its drawing or in words, and shape it by hand. **Try on** asks GPT Image for four takes inside that part's mask. Keep one, and **Every angle** turns it.
- **On me.** The same thing on your own face, from a photo or from the **live mirror**: the front camera, with the look painted on you as you move (a fringe in your own hair). *Every side of you* catches the front and both sides as you turn your head. Then the ring deals every look on you, and **Show** makes a card to hand a stylist.
- **The desk.** Behind it all is a studio you talk to: pictures with handles (@A), looks (#Velvet Hour), pins, backdrops, variations, rooms (whole themes, invented from words) and today's sky.

`README.md` tells it in full. There are three editions. The Lookbook cards show the style and the person's name, with the picture's source recorded in the catalog and shown in the mirror.

| Edition | What makes the pictures | Label |
|---|---|---|
| **Showcase** | the device draws sketches | *Sketch* (the drawn sitters in the ring: *Drawn*) |
| **Live · Simulator** | stand-ins | *Simulated* |
| **Live · Workstation** | GPT Image | *Render* on the desk, *GPT Image* in the mirror |

This computer is where the third one comes alive.

## House rules

- **The `studio` branch only.** Commit with plain messages and push to `studio` on https://github.com/akane-lovesl/likeness, the public repository. Never push to `main`, never force-push, and never merge into `main`: that is the user's call.
- **Nothing personal is committed.** That means no photographs or renders of real people, nothing made from one, and no tokens, pairing keys or certificates.
  - `private/` is ignored by git. Jobs, uploads, this machine's settings, certificates and learned estimates live there.
  - The only faces that may be committed are the drawn sitters (`tests/fixtures/sitters/`, `web/sitters/`) and the Lookbook's invented people (`web/examples/`). Test with those.
  - If the user tries their own photograph, it stays in `private/`.
- **Labels stay honest.** Only GPT Image's pictures are called a render. Mark sketches and simulation where they appear. The Lookbook and the exported stylist card keep their pictures clear of model branding.
- **The studio protocol stays stable.** That is the event names and endpoints at the top of `likeness/server.py`, and the client in `web/js/studio/remote.js`. If you must change it, change both sides and the tests in one commit.
- **No GitHub Actions workflow files.** The push token cannot push them.
- **Before every push**, run `npm run check`, `uv run pytest` and `npm test`. One Chrome at a time: don't run the browser suite beside other browser work.
- **The studio's own Codex runs keep their sandbox:** `--sandbox workspace-write`, never `danger-full-access`.
- **Ask the user first** before you:
  - delete anything outside the repository;
  - change system settings beyond installing the tools below;
  - publish anything anywhere other than the `studio` branch.
- **Keep the app uncluttered.** One great interaction beats three adequate ones.

## What your session must allow

Several steps start Codex again from inside your session, because the studio runs one `codex exec` per turn. These are `likeness serve`, `likeness probe codex --smoke`, `likeness examples`, and `likeness relay run 0003` and `0004`, which run those. They need the network to reach the model. The browser tests also need to start Chrome and local servers.

If your sandbox stops any of that, ask the user either to approve running that command outside the sandbox, or to run it in their own terminal and tell you when it is done. Never loosen the studio's own runs to get round it.

Some commands run for a long time: `likeness examples` can take hours. If one command can't run that long in your session, do one of these:

- make the people one at a time with `--only <id>` (what is already on disk is kept);
- ask the user to run `uv run likeness relay run 0004 --only examples` in their own terminal.

## Part 1 · The code

An older copy of the repository may already be on this computer, from when Likeness ran local models. If so, use it. First check `git status`: it should be clean apart from ignored files. If it is not, ask the user what to keep. Then:

```
git fetch origin
git switch studio
git pull --ff-only
```

If there is no copy yet:

```
git clone https://github.com/akane-lovesl/likeness
cd likeness
git switch studio
```

Work in this folder from now on.

## Part 2 · Install

Check each tool first, and install only what is missing. Open a new terminal after installing, so that PATH is fresh.

| Needed | Check | If it is missing |
|---|---|---|
| Git | `git --version` | `winget install --id Git.Git -e` |
| uv, for Python and its packages | `uv --version` | `winget install --id astral-sh.uv -e` |
| Python 3.12 or later | `uv python find 3.12` | `uv python install 3.12` (`uv sync` also fetches it) |
| Node.js 20 or later, with npm | `node --version` | `winget install --id OpenJS.NodeJS.LTS -e` |
| Google Chrome, for the browser tests | `npm test` finds it | `winget install --id Google.Chrome -e`; or `npx playwright install chromium` and set `LIKENESS_BROWSER_CHANNEL=chromium` |
| Codex CLI, signed in | `codex --version`, `codex login status` | the user signs in with `codex login` |
| mkcert, for the phone's live camera (Part 6) | `mkcert -version` | `winget install --id FiloSottile.mkcert -e` |

Then, in the repository:

```
uv sync
npm ci
npm run check
uv run pytest
npm test
```

All three checks were green where the code was written: 43 pytest tests and 62 browser tests. Get them green here before you change anything. If one fails, fix the setup, not the tests, and note what it took.

**Off local models.** Likeness no longer runs Qwen or any other local model. There is no torch, CUDA or model download left in it, and `uv sync` takes the old packages out of the virtual environment. Old weights may still be on disk: in the Hugging Face cache (`%USERPROFILE%\.cache\huggingface\hub`), or in a `models/` folder in an older copy. If so, say in the report where they are and how big. Do not delete them; the user decides.

## Part 3 · The Codex studio

Carry out `relay/0003-codex-studio/PROMPT.md`, steps 1 to 9. Its step 10, the phone, waits for Part 6.

This part is done when:

- `uv run likeness serve` prints *Codex · GPT Image*;
- every flow on the desk makes real pictures, labelled Render;
- the time estimates are this computer's;
- the briefs are tuned to what Codex really does.

## Part 4 · The Lookbook's people

Carry out `relay/0004-lookbook/PROMPT.md`. These are the pictures that take the drawings' place:

- eight people who do not exist;
- for each, a portrait, three looks and three angles;
- 56 renders in all, under `web/examples/`, with `web/examples/manifest.json` saying `"kind": "render"`.

Once three looks are there, the app opens on them and the drawn sitters step aside by themselves. Leave `web/sitters/` and `tests/fixtures/sitters/` where they are: they are the tests' faces and the fallback.

Judge every picture before it is committed (the packet says how), and make again whatever falls short. Then commit the pictures with the manifest. Four to six megabytes in all is about right.

## Part 5 · Everything, with real pictures

Now be someone opening Likeness for the first time:

- the Workstation edition (`uv run likeness serve`);
- in Chrome at a phone's size (F12, then a phone in the device bar);
- with the people you have just made.

**Start with the tour.** With the studio running, `npm run tour` uses the whole product end to end at a phone's size and films it into storyboards in `relay/0004-lookbook/out/tour/`:
- `00-tour.jpg` is all of it on one sheet;
- there is a sheet for each scene, every frame captioned with what the picture in front says it is;
- `tour.md` has the timings: a Try on, every angle, a picture from words, and how fast the live mirror reads a face.

Its cameras play drawn sitters and its photos are drawn sitters; it never sees you. Look at every sheet before you judge the rows below, and run it again after each fix.

Every row below must hold. Where one does not, fix it: the code, the words or the briefs. The packets cover most rows in detail; here, check that each still holds now that real pictures are in place.

| | What must hold |
|---|---|
| **The first time** | In a fresh browser profile the welcome is a sitting: one of the people you made fills the screen, then wears a look in a sweep of light, with the three looks they were made in underneath. Touch one: it sweeps in. Drag across the picture: the light follows the finger, the look on one side and the face as it was on the other. *Someone else* moves on. **Try it on me** picks that look and asks for your face; **Look around** opens the Lookbook with that face in front. Say whether someone new knows within a few seconds what Likeness is for and what to do first, and whether the line under the buttons says honestly what this edition does with their own looks. *Skip* and Escape work and are remembered; the name at the top brings it back. |
| **First sight** | Within a few seconds it is clear what Likeness does: real faces, a look sweeping across each, and its name beneath. A second or two in, the faces are read on the device: each card closes on the head and leans in on its part, and the look sweeps in close. It must read at a glance. The ring turns by itself and under a finger. Touching a part such as Bangs or Brows deals only that part's looks. |
| **Mix a look** | Pick a style from one part, then from others: every face in the ring wears all of them at once, named for all of them. A pick's token takes it back. The dock never jumps from part to part. Touch a face: the mirror opens wearing the whole look, and **Try on** sends all of it. |
| **Painted on real faces** | With a look mixed on the Lookbook, the people you made wear it painted from their own pictures: a fringe is their own hair brought forward (its curl, grey and grain theirs; no longer than their hair is; a curtain open across the forehead, framing the face; left in pencil where no hair is found), brows hair by hair, liner, a smoky eye as shadow, a beard grown hair by hair on the skin's own light; a hair colour keeps the hair's own light and shade, and a painted fringe is dyed with it. Only a cut is a line. Every such card says *Sketch*. Judge it on all eight, and on a face of your own: say where it reads as hair and make-up and where it reads as something laid on. Then **Try on** the same look and put the painted preview beside GPT Image's render: say whether the preview promised what the render gave (fringe length and fullness, how far a colour lifts dark hair, how full a beard is). Drag a painted face sideways: turned on the device it wears the same paint. |
| **Live, painted** | Open the camera from the Lookbook with your own face and pick *Bangs*, then *Curtain* and *Blunt*: the fringe should be your own hair, combed forward, following your head as you move and turn. Say whether it keeps up on this machine (`data-paint` on the live view says how long one painting takes, in milliseconds; it is painted again as often as the device keeps up with and carried with your face between) and whether it ever slips off the head. Try a colour with it: the fringe should take the colour with the rest of the hair. |
| **One line** | On the Lookbook, type *a lighthouse inside a teacup, at dusk* into the line: its arrow should turn into *Paint it*, and sending it should rise into the desk, where GPT Image paints it. Then *take me to the seaside*: the whole place should change and the Lookbook stay where it was. |
| **Words** | On the Lookbook, *curtain bangs, a lot longer, parted left* turns the ring to a face wearing that look and draws it on the real face as said. The card says *Sketch* until the words are gone, then the render comes back. *Copper, a shade deeper* washes the hair. Left alone, the line names the looks the people wear and the ring turns to each, with nothing sketched over a render. A sketch over a real face must look deliberate and beautiful; if it doesn't, change how it is drawn (`dress` in `web/js/looks/book.js`, the strokes in `web/js/looks/markup.js`). |
| **The mirror** | On an example person, their looks show as takes, and their three angles turn under a finger. Dragged sideways, a portrait turns on the device (*Turned on this device*) and springs back. Both ways: the jaw stays smooth and round, the far ear tucks away, glasses turn with the face, the hair comes round, and the wall stays straight. The parts stay in the dock; their styles come up under them; the frame glides, it never jumps. |
| **On me, from a photo** | Use a drawn sitter as the photo. The face is read: a line of light, its points, its outlines, then the parts named in the margins. Pick a look and shape it by its handles; the words write themselves. **Try on** brings four GPT Image takes inside the part's mask, scrubbed with a finger. While GPT Image works, the wait plays out in the frame: a light over the part, Codex's own words and an honest time left, and previews developing inside the part if its image tool streams them. The first take is swept in across the face by a line of light, as the Lookbook's looks are, and the wait's light and words go with it: say whether that arrival feels like the moment it should be. Keep one, and **Every angle** brings three more as the frame turns. |
| **Fit it** | In the mirror, on one of the people and then on you, put on a fringe and a colour, then **Fit it**. Answer the lenses by eye, with no idea in mind first: say whether each pair is a real choice (two different looks, close enough to compare), whether the steps feel like a stylist's (coarse, then fine), and whether the look at the end is more you than the one you began with. Then **Try on**: say whether GPT Image's takes keep what was fitted (a fringe *a little longer*, a colour *a shade deeper*). |
| **Weeks on** | In the mirror, mix a fringe and a colour on one of the people (blunt and platinum; curtain and copper), then **Grow out**. The weeks walk on to the first trim; drag them on to three months. Say whether what time does reads as true: the fringe falling and losing its line, the roots coming in at the parting and the hairline in their own colour, brows growing back, a beard filling in. Then **Try on** at six weeks and put GPT Image's take beside the painted one: say whether the studio drew the weeks (the take says *6 weeks on*). |
| **Drawn on, or borrowed** | In the mirror, + then *Draw on it*: circle the jaw, cross out a curl. + then *A reference*: a photo of a cut or a colour. **Try on**: GPT Image follows the marks without drawing them in, and takes the reference's look, never its face. If it does not, the words for each are in `likeness/brief.py` (`look`, `marks`). |
| **Several at once** | Ask for a second look while the first is being made: both come back, made side by side. The pill counts them, and *In the studio* says what each is and how far it has got. Close the tab mid-turn and open it again: the turn is picked up and lands once. A finished one opens again from the list. |
| **The live mirror** | Start the camera on the Lookbook. The look stays on a moving face. Touching a part opens every style as live tiles; a swipe changes style. *Colour* lands on hair only. The shutter carries the moment to the mirror with the look on. `section.lv` tells how the face is read: `data-reader` (`aside`, in a worker, or `page`) and `data-read` (milliseconds). |
| **Every side of you** | Turning slowly catches the front and both sides without holding still for long. The mirror then turns through them like one head. |
| **The ring becomes you** | With a photo of you kept, the ring deals every look on you, labelled *Sketch*, and *Them · You* switches between the people and you. A card opens your photo in the mirror wearing that look, and **Try on** from there makes renders. |
| **Show it** | On your photo, **Show** and then **Save the card** give a 1080 × 1350 picture you would hand a stylist. The card identifies sketched details where present. |
| **The desk** | 0003's step 6 walk-through still holds with the finished app: words, a picture brought in, @ and #, pins, backdrops, variations, every angle, rooms (invented, and *Take me there*), today's sky, Kept and the taste note, paces, Stop, a reload mid-turn, and a failure. |
| **Honest labels** | The showcase (`npm run serve`) labels its sketches. The mirror identifies the example portraits as renders. The simulator stamps its stand-ins. Only pictures made with GPT Image are called renders. |
| **Feel** | Waiting feels alive: notes, the plan, the fuse, previews. Nothing stutters or jumps. With animations turned off in Windows (*reduce motion*), the app is calm. The Salon is the room at first (dark); a room changes everything, the Lookbook and the mirror included, and nothing flips between light and dark unless a room is chosen. No label spills out of its box, in any room. |

The code was written on a small computer with no graphics chip, using only drawn faces. Some things could not be judged there and need your eyes here:

- **The on-device turn** (WebGL over a head-shaped grid, `web/js/looks/turn.js`) was rebuilt for a smooth jaw, a far ear that tucks away and glasses that turn whole, and judged on drawings only. Check it on photographs, at both extremes, with and without glasses. Where WebGL is drawn in software it uses a lighter grid and no edge smoothing (`drawnInSoftware`); with a graphics chip it should never be that one.
- **The keyboard on a phone.** It should lay over the app, with the line being typed raised above it (`web/js/core/keyboard.js`, `interactive-widget` in `web/index.html`). That was only ever tried in a desktop browser.
- **References and marks.** Whether GPT Image takes a look from a reference without its face, and follows rough marks without drawing them, has never been tried.
- **Hair colour edges** were only ever judged on drawn hair.
- **Sketches over real faces.** The ring's strokes were tuned on drawings. On photographs they may want to be finer, softer or brighter.
- **The live mirror's speed.** Where there is a core to spare, faces are read in a worker (`data-reader="aside"`), so the mirror is drawn at the camera's pace. Check that the look keeps to a turning head, here and on the phone. `AHEAD` in `web/js/looks/live.js` is how far a face is carried on between readings.
- **The share sheet.** Saving the card through a phone's share sheet has never been tried.
- **The shape words.** Nobody knows yet whether GPT Image follows them (length, parting, arch, shade). 0004 asks for examples of both.

## Part 6 · The phone, last

Carry out 0003's step 10:

- the pairing link and QR code;
- the firewall;
- HTTPS with mkcert, so that the phone allows the live camera. The certificate and key stay in `private/`.

The user has to scan the code and trust mkcert's root certificate on the phone. When you are ready, tell them exactly what to do, step by step, and wait.

Then go through Part 5 again on the phone, quickly. Pay the most attention to what only a phone shows:

- the live mirror at the phone's own speed;
- *Every side of you* with the real front camera;
- **Save the card** through the share sheet;
- how long a Try on takes.

## Part 7 · Finish

1. The three checks are green. If one cannot run here, say why.
2. Everything is committed and pushed to `studio`.
3. The two reports the packets ask for are written, with the contact sheets: `relay/0003-codex-studio/REPORT.md` and `relay/0004-lookbook/REPORT.md`. The tour's last run stays beside them (`relay/0004-lookbook/out/tour/`). All of it stays on this computer (git ignores it).
4. Then tell the user, in a few plain lines:
   - what works now;
   - what still is not right;
   - the decisions that are theirs (old model files, merging `studio` into `main`, anything else);
   - the first thing to try on the phone.
