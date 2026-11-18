# The relay

Two machines build Likeness, and they never talk to each other. The code is written on one; the other is the workstation, where Codex CLI runs and makes the pictures. **GitHub is the only channel between them.** Work for the workstation travels as a numbered packet in this folder.

```
relay/NNNN-slug/
  PROMPT.md     what to do and why, for Codex on the workstation. Self-contained.
  task.toml     the stages, for the runner: argument lists, timeouts, gates, files to expect
  out/          written by the runner: one log per stage, status.json, RUN.md (kept on the workstation; git ignores it)
  REPORT.md     written by Codex afterwards, for the user (kept on the workstation; git ignores it)
```

## One cycle

1. A packet is written and pushed.
2. On the workstation the user pulls, opens Codex in the repository and says:

   > Carry out relay/0003-codex-studio/PROMPT.md.

3. Codex follows the prompt. The mechanical part is one command, `uv run likeness relay run <id>`. It runs the stages in order, stops at the first failed gate, and writes everything down in `out/`.
4. Codex fixes what it finds, commits and pushes the code, and leaves `REPORT.md` for the user.

## The packets

| Packet | What it is for |
|---|---|
| `0003-codex-studio` | Wire the Codex engine to the workstation, prove every flow end to end with real pictures, calibrate time estimates, polish what real use reveals, and connect the phone last. A one-shot hand-off. |

## The runner

```
uv run likeness relay pending                          packets not yet run to the end (optional ones are not listed)
uv run likeness relay run 0003                         run a packet
uv run likeness relay run 0003 --only probe --only smoke     repeat chosen stages
```

A stage in `task.toml`:

```toml
[[stage]]
id = "smoke"
run = ["uv", "run", "likeness", "probe", "codex", "--smoke"]   # an argument list, no shell: it reads the same on Windows and Linux
timeout = 2400          # seconds (default 3600)
gate = true             # default: a failure stops the run. false: report it and carry on
expect = ["relay/0003-codex-studio/out/smoke/smoke-create.png"]   # files that must exist afterwards, from the repository root
cwd = "tools"           # optional: a folder of the repository to run in
```

In an argument, `{root}` stands for the repository's path. Before the logs are written down, the runner rewrites that path as `.` and the home folder as `~`, and keeps only the last state of each progress bar.

## What never travels

Photographs of real people, pictures made from them, tokens, pairing keys and the studio's settings for this machine. They live in `private/`, which git ignores.
