# Start here · the hand-off

**Everything Likeness needs from this computer, as one job: install it, wire it to Codex and GPT Image, make the Lookbook's people and put them in the app, prove every feature with real pictures, and the phone last.**

You are Codex, on the user's Windows computer, and the user has asked you to carry out this file. It is the whole job, in order. Two packets beside it hold the detail of their parts: `relay/0003-codex-studio/PROMPT.md` and `relay/0004-lookbook/PROMPT.md`. Read this file to the end before starting, then each packet when you reach it.

Most of it is yours to do without asking. Where a prompt and reality disagree, believe reality, change the code, and keep the tests honest. The user wants to come back to a studio that works here, beautifully, and to a short, plain account of what was done. It is a long job (the pictures alone take hours), so commit and push as you go. If you are picking it up again, `git log` and the reports show where it got to.

## What Likeness is

A personal image studio, phone-shaped. It has two halves: a web app (`web/`: plain HTML, CSS and ES modules on a 9:16 stage, no build step) and a small studio server (`likeness/`, FastAPI) that runs Codex for the pictures.

- **The Lookbook.** It opens on a ring of faces that turns by itself. Each face wears a look (bangs, brows, lashes, lips, beard, colour, cut) that sweeps across it in light. Typing *curtain bangs, a lot longer, parted left* turns the ring to that look and reshapes the strokes.
- **The mirror.** Touch a face and the mirror opens on it. The face is read on the device and its parts are named. You choose a look by its drawing or in words, and shape it by hand. **Try on** asks GPT Image for four takes inside that part's mask. Keep one, and **Every angle** turns it.
- **On me.** The same thing on your own face, from a photo or from the **live mirror**: the front camera, with the look sketched on you as you move. *Every side of you* catches the front and both sides as you turn your head. Then the ring deals every look on you, and **Show** makes a card to hand a stylist.
- **The desk.** Behind it all is a studio you talk to: pictures with handles (@A), looks (#Velvet Hour), pins, backdrops, variations, rooms (whole themes, invented from words) and today's sky.

`README.md` tells it in full. There are three editions, and every picture says which one made it:

| Edition | What makes the pictures | Label |
|---|---|---|
| **Showcase** | the device draws sketches | *Sketch* (the drawn sitters in the ring: *Drawn*) |
| **Live · Simulator** | stand-ins | *Simulated* |
| **Live · Workstation** | GPT Image | *Render* (the ring's people: *GPT Image*) |

This computer is where the third one comes alive.

## House rules

- **The `studio` branch only.** Commit with plain messages and push to `studio` on https://github.com/akane-lovesl/likeness, the public repository. Never push to `main`, never force-push, and never merge into `main`: that is the user's call.
- **Nothing personal is committed.** That means no photographs or renders of real people, nothing made from one, and no tokens, pairing keys or certificates.
  - `private/` is ignored by git. Jobs, uploads, this machine's settings, certificates and learned estimates live there.
  - The only faces that may be committed are the drawn sitters (`tests/fixtures/sitters/`, `web/sitters/`) and the Lookbook's invented people (`web/examples/`). Test with those.
  - If the user tries their own photograph, it stays in `private/`.
- **Labels stay honest.** Only GPT Image's pictures are called a render. A sketch or a simulated picture never passes for one: not on a card, not on a stamp, not on the foot of a saved card.
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

All three checks were green where the code was written: 41 pytest tests and 44 browser tests. Get them green here before you change anything. If one fails, fix the setup, not the tests, and note what it took.

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

Every row below must hold. Where one does not, fix it: the code, the words or the briefs. The packets cover most rows in detail; here, check that each still holds now that real pictures are in place.

| | What must hold |
|---|---|
| **First sight** | Within a few seconds it is clear what Likeness does: real faces, a look sweeping across each, its name beneath, an honest *GPT Image* label. The ring turns by itself and under a finger. Touching a part (Bangs, Brows…) deals only that part's looks. |
| **Words** | On the Lookbook, *curtain bangs, a lot longer, parted left* turns the ring to the look and moves the strokes. Left alone, the line acts things out by itself. |
| **The mirror** | On an example person, their looks show as takes, and their three angles turn under a finger. Dragged sideways, a portrait turns on the device (*Turned on this device*) and springs back. The cheek's edge stays clean, the hair comes round, and the wall stays straight. |
| **On me, from a photo** | Use a drawn sitter as the photo. The face is read: a line of light, its points, its outlines, then the parts named in the margins. Pick a look and shape it by its handles; the words write themselves. **Try on** brings four GPT Image takes inside the part's mask, scrubbed with a finger. Keep one, and **Every angle** brings three more as the frame turns. |
| **The live mirror** | Start the camera on the Lookbook. The look stays on a moving face. Touching a part opens every style as live tiles; a swipe changes style. *Colour* lands on hair only. The shutter carries the moment to the mirror with the look on. `section.lv` tells how the face is read: `data-reader` (`aside`, in a worker, or `page`) and `data-read` (milliseconds). |
| **Every side of you** | Turning slowly catches the front and both sides without holding still for long. The mirror then turns through them like one head. |
| **The ring becomes you** | With a photo of you kept, the ring deals every look on you, labelled *Sketch*, and *Them · You* switches between the people and you. A card opens your photo in the mirror wearing that look, and **Try on** from there makes renders. |
| **Show it** | On your photo, **Show** and then **Save the card** give a 1080 × 1350 picture you would hand a stylist. Its foot says truly what each picture is. |
| **The desk** | 0003's step 6 walk-through still holds with the finished app: words, a picture brought in, @ and #, pins, backdrops, variations, every angle, rooms (invented, and *Take me there*), today's sky, Kept and the taste note, paces, Stop, a reload mid-turn, and a failure. |
| **Honest labels** | The showcase (`npm run serve`) sketches, and says *Sketch* wherever it does. The example people in it are real renders, and say so. The simulator stamps its stand-ins. Nothing GPT Image did not make is called Render. |
| **Feel** | Waiting feels alive: notes, the plan, the fuse, previews. Nothing stutters or jumps. With animations turned off in Windows (*reduce motion*), the app is calm. |

The code was written on a small computer with no graphics chip, using only drawn faces. Some things could not be judged there and need your eyes here:

- **The on-device turn** (WebGL over the face's mesh, `web/js/looks/turn.js`) was tuned on drawings. Halfway through a turn, a faint edge can show beside the head.
- **Hair colour edges** were only ever judged on drawn hair.
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
3. The two reports the packets ask for are written, with the contact sheets: `relay/0003-codex-studio/REPORT.md` and `relay/0004-lookbook/REPORT.md`. They stay on this computer (git ignores them).
4. Then tell the user, in a few plain lines:
   - what works now;
   - what still is not right;
   - the decisions that are theirs (old model files, merging `studio` into `main`, anything else);
   - the first thing to try on the phone.
