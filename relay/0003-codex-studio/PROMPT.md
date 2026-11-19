# 0003 · The Codex studio

**Wire it to this machine, prove it end to end, and polish what real use reveals.**

You are Codex, working in the Likeness repository on the user's own computer. This packet is a one-shot hand-off: when you are done, the studio should work here, beautifully, without the user having to go back to the author for fixes. So you have a broad mandate. Where this prompt and reality disagree, believe reality, change the code, and keep the tests honest. Read the whole prompt before starting.

## What Likeness is

A personal image studio you talk to. It is a phone-shaped web app (`web/`: plain HTML, CSS and ES modules, no build step, laid out on a 9:16 stage sized in `cqw`). Pictures sit on a desk with handles (A, B, C, …), and you say what you want: *"Use @B as a reference and make @A look like it"*, *"#Velvet Hour, two versions"*, or you pin part of a picture (tap: an on-device segmenter selects it) and write what it should become. While you type, the app reads your intent and shows it as a reading strip with a time estimate. Sending makes a *turn*. The studio works on it live: stage words in the room's voice, notes, a plan, previews, then the pictures, a short reply, and three suggestions for what to say next.

Around that sits the atmosphere:

- **Rooms.** Whole themes: colours, type, frame, ornaments, scenery, weather, little sounds, motion, the wipe used to enter, and the voice the studio talks in. There are seven built in, and people invent their own from words or a picture. On the device a maker (`web/js/room/maker.js`) reads the sentence cue by cue and composes the room; on the workstation the studio's model invents it instead. Typing *"take me to a rainy Tokyo jazz bar at midnight"* in the composer moves the whole app there, and after a picture of a place the first idea is *Take me there*, which does the same with its words.
- **Today's sky.** Mood, weather and light. It resets each morning.
- **Looks.** Image styles as data.
- **Backdrops.** Ideas the studio suggests for a picture, not a preset list.

There are three editions, each always labelled honestly. Never let one pass for another.

| Edition | How it runs | What it makes | Label on every picture |
|---|---|---|---|
| Showcase | static files | the device sketches studies | Sketch |
| Live · Simulator | `likeness serve --engine simulator` | Pillow stand-ins stamped SIMULATED · NOT A RENDER | Simulated |
| Live · Workstation | `likeness serve` with Codex | real pictures, made with GPT Image | Render |

## What is built, and what is not

**Built, and green where it was written.** No Codex CLI was available there.

- The whole app.
- The studio server (`likeness/server.py`): one turn API plus an event stream per job.
- The simulator engine.
- The Codex engine (`likeness/engines/codex.py`), tested only against a stand-in CLI (`tests/fake_codex.py`).
- The briefs Codex is given (`likeness/brief.py`).
- Settings (`studio.toml`).
- `likeness probe codex`.
- 41 pytest tests and a 33-test browser suite.

**Not proven anywhere yet.** All of these are yours to settle:

- the real `codex exec` on this machine: its flags and its JSON event stream;
- how Codex makes images non-interactively;
- Windows process handling;
- real timings.

## How the Codex engine works

Read `likeness/engines/codex.py` and `likeness/brief.py`. In short:

- **One `codex exec` per turn, in a folder of its own** under `private/jobs/<time>-<id>/`:
  - `in/A.png`, `in/B.png`, …: the pictures, named by handle.
  - `in/A.pin1.png`: a pin mask (white means change).
  - `in/A.edit.png`: all pins as one edit mask, in the image-edit convention where transparent means change.
  - `in/A.subject.png`: the subject to keep, for backdrops.
  - `out/`: where Codex must save `1.png`, `2.png`, ….
  - `brief.md`, `events.jsonl` and `stderr.log`: your first stop when something is off.
- **The command line** is:

  ```
  codex exec --json --skip-git-repo-check -C <job folder> --sandbox workspace-write [-m <model>] -c model_reasoning_effort=<effort> -i in/A.png … -- -
  ```

  The brief arrives on stdin. The pace chosen in the app (Quick, Fine or Deep) picks `[codex.pace.<pace>]` in `studio.toml` (model, effort, image quality, timeout).
- **The brief asks for three one-line markers**, so the app can show honest progress:
  - `PLAN {"summary", "prompt"}` first;
  - then the pictures, saved to `out/`;
  - `DONE {"reply", "suggestions"}` last;
  - or `FAILED {"message", "hint"}` instead.
- **The event stream becomes the app's progress.**
  - Reasoning headings (`**Bold titles**`) become notes on the job card.
  - PLAN becomes the plan. Its image prompt is typed out on the card.
  - A picture becomes a result the moment its file in `out/` stops growing.
  - DONE becomes the reply.
  - FAILED, a `turn.failed` or an `error` becomes a failure with a hint.
  - Both the `item.*` events and the older `{"msg": …}` lines are understood.
  - If an image tool reports a picture saved elsewhere (a path in its event item) or inline (base64), the engine adopts it.
- **Rooms, looks and backdrop ideas are words only.** They run `codex exec` read-only with `--output-schema` (strict JSON schemas in `likeness/rooms.py`) and `-o answer.json`. Whatever comes back is normalised there, so a strange answer can never break the app.
- **Stop** kills the process tree (`taskkill /T /F` on Windows). Each pace has a timeout.

The app talks to the studio over a small protocol (top of `likeness/server.py`, client in `web/js/studio/remote.js`). Event names: `stage`, `note`, `plan`, `progress`, `partial`, `result`, `reply`, `done`, `failed`. Keep the protocol stable. If you must change it, change both sides and the tests in the same commit.

## Ground rules

- **Nothing personal is committed.** No photographs or renders of real people, no tokens, no pairing keys. `private/` is ignored by git and holds jobs, uploads, `studio.toml` overrides and the learned time estimates. Test with the drawn sitters in `tests/fixtures/sitters/` and the app's sample pictures. The user may try their own photographs; those stay in `private/`.
- **No GitHub Actions workflow files.** The token cannot push them.
- **Labels stay honest.** The Workstation edition only shows when the Codex engine is running. Only Codex's pictures are labelled Render.
- **Keep the sandbox.** Use `workspace-write`, never `danger-full-access`. If the image tool needs the network, enable `sandbox_workspace_write.network_access` through `[codex.overrides]` rather than dropping the sandbox.
- **Before every push**, run `npm run check`, `uv run pytest` and `npm test`. When you change how the engine reads Codex, change `tests/fake_codex.py` to match the real thing, so the tests describe this machine's Codex rather than a guess.
- **Commit as you go** with plain messages, and push to this repository, the public one the user named. Never force-push.

## The work, in order

### 1. Baseline

```
uv run likeness relay run 0003
```

This runs sync, pytest, the probe, two real turns and the browser suite, and writes `relay/0003-codex-studio/out/RUN.md`. It will probably stop at the probe or the smoke test the first time. That is expected: steps 2 to 4 are how you get past it. Rerun single stages with `--only probe`, `--only smoke`, and so on.

The browser suite needs Google Chrome. If it is absent, run `npx playwright install chromium` and set `LIKENESS_BROWSER_CHANNEL=chromium`.

### 2. Codex CLI as it really is

1. Run `codex --version`, `codex exec --help` and `codex login status`.
2. Compare every flag in `Codex.argv()` with the help text. `likeness probe codex` checks them by name; make it true, not merely green.
3. Check that `-c model_reasoning_effort=<word>` is accepted for the models you will use, and which efforts each model takes.
4. Fix what differs in `likeness/engines/codex.py`, then mirror it in `tests/fake_codex.py` and `tests/test_codex.py`.
5. Make sure the command resolves on Windows. `shutil.which` finds `codex.cmd` or `codex.exe`. Set `[codex].command` in `private/studio.toml` if it does not.

### 3. Pictures from `codex exec`

This is the heart of it. In a scratch folder, ask `codex exec --json` to make a small picture and save it as `out/1.png`. Then ask it to edit that picture with an input image, and with a mask. Keep the JSONL; it is the ground truth.

Find out:

- **What it uses.** Does it have a built-in image tool (GPT Image), or does it reach for something else? Does that need a feature switch, a config key, a login, or network inside the sandbox?
- **How it reports images.** Which event item type carries an image, and does the item hold a path, a URL or base64? Where do the files land?
- **Inputs.** Does the tool take input images (attached with `-i` or read from `in/`) and masks for edits? Is identity preserved when a person is edited? Test that with the drawn sitters.

Then make the engine fit what you found:

- Put the exact instructions into `[codex.images].hint`. Use the defaults in `studio.toml` if they are true everywhere, or `private/studio.toml` if they are true only here.
- Teach `Follow._item` the real image event, and adopt pictures from wherever they land.
- Record a trimmed real event sequence in `tests/fake_codex.py` (no personal content) and add a test.

If the tool can stream partial images, emit them with `work.partial(index, image)`. The app shows them as previews, which is the best in-between state there is.

### 4. This machine's settings

Write `private/studio.toml` (same shape as `studio.toml`, only the keys you change):

- `command`;
- a model per pace, if the default is not what you want;
- efforts and image quality per pace. Quick should feel quick, and Deep should be worth its wait;
- timeouts;
- any `[codex.overrides]`.

Check that `uv run likeness serve` picks the Codex engine (`engine = "auto"` does when `codex --version` answers) and prints `Codex · GPT Image`.

### 5. Smoke

```
uv run likeness relay run 0003 --only probe --only smoke
```

Look at `out/smoke/smoke-create.png` and `smoke-edit.png`, and at the notes, the plan and the reply in `out/smoke/probe.json`. The edit should be the same still life with a red cloth. If the edit drifts, fix the brief or how inputs are passed.

### 6. End to end in the app

Run `uv run likeness serve` and open http://127.0.0.1:8787 in Chrome. Press F12 and choose a phone-sized viewport, or just make the window narrow. The header pill must read **Live · Workstation**.

Walk through every flow and watch the job card each time: stage words, notes streaming from Codex's reasoning, the plan, the time estimate, the results labelled Render, the reply, and the suggestion chips.

1. **Words to a picture.** Use a suggestion chip, then your own words.
2. **Bring a picture.** Use the drawn sitters in `tests/fixtures/sitters/` for people and any landscape for places. Then:
   - say *"make it golden hour"*;
   - use *"#Velvet Hour"*, or the Looks sheet with its strength slider;
   - with two pictures, say *"Use @B as a reference and make @A look like it"*;
   - use *"three variations"*.
3. **Pins.** Open a picture, choose Pin, tap two different parts, give each its own note, and send. Only those parts may change.
4. **Backdrops.** Open a picture, then Backdrop. The ideas come from the studio (`POST /api/backdrops`). Choose one; the subject must stay as it is.
5. **Invent a room from words**, from the Rooms sheet and again by typing *"take me to …"* in the composer, and a look from words, from the Looks sheet. All of them come from `codex exec` with an output schema. They must come back valid and pleasant, and the room's voice must sound like a person. Paint a place and use *Take me there* too. Compare a few studio rooms with what the device maker makes from the same words (the showcase at `npm run serve`): the studio's should be at least as good, or the room brief in `likeness/brief.py` needs work.
6. **Paces.** Run the same turn at Quick and at Deep, and confirm the job folders show different models or efforts.
7. **Stop** mid-turn. No `codex` or `node` process may be left behind (check Task Manager). Stop also works before the pictures have finished uploading.
8. **Failure.** Sign out of Codex or break `command` briefly. The card must say what happened and what to do, not hang.
9. **Reload mid-turn.** The app follows the job again from the studio. Pictures that had already arrived are not added twice, and nothing is lost.
10. **Your taste.** In Album → Kept, write a standing note, e.g. *"warm light, a little film grain"*. It travels with every turn. Check that it reaches `brief.md`, and that Codex honours it without overriding what the words ask for.

Fix whatever is rough. Real turns take tens of seconds, so make sure the waiting feels alive: notes arriving, the plan showing, the fuse moving, previews if the tool has them.

### 7. Time estimates

After about three turns per pace, the server has learned medians in `private/estimates-codex.json`. Put typical values for this machine into `DEFAULTS["codex"]` in `likeness/estimates.py` and `DEFAULTS.workstation` in `web/js/core/estimate.js`, so first-run estimates are honest. Commit only the numbers.

### 8. The briefs

Tune `likeness/brief.py` with what you learned. Faces and identity must stay unchanged on edits; masks must be honoured exactly; the right number of pictures must come back, with nothing extra in `out/`; replies must be warm and short, in the room's voice. Keep the PLAN/DONE/FAILED markers. The app depends on them.

### 9. Polish with a free hand

Use it as the user would, for real, for a while, and fix what bothers you: slowness, flat moments, unclear words, ugly edges, anything that lets a simulated or sketched picture look like a render. Keep the app uncluttered. Prefer one great interaction to three adequate ones.

### 10. The phone, last

`uv run likeness serve` prints a pairing link and a QR code. The phone must be on the same network as this machine; allow Python through the Windows firewall on private networks when asked. Scan the code once and the phone stays paired; strangers get a polite refusal. Then do the whole walk-through from step 6 on the phone.

**The look camera needs HTTPS.** Under *Bring a picture → Through a look*, the camera is live and the looks are sketched on the device. Browsers only allow the camera on a secure origin, so over plain `http://` on the network the app quietly falls back to the phone's own photo picker, which still offers the camera.

To get the live camera on the phone:

1. Make a certificate for this machine's network address, for example with `mkcert`, and install its root on the phone.
2. Run `uv run likeness serve --cert cert.pem --key key.pem`.
3. Keep the certificate and key in `private/`.

### 11. Finish

1. Run all three checks green. If a check cannot run here, say why.
2. Commit and push.
3. Write `relay/0003-codex-studio/REPORT.md` for the user. It stays on this machine (git ignores it). Cover:
   - what you found about Codex and images;
   - every change and why;
   - the timings per pace;
   - what is still not perfect;
   - anything the user must decide.
