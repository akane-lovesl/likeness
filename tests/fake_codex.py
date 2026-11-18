"""A stand-in for Codex CLI: enough of  codex exec --json  to test the studio's engine on any machine.

FAKE_CODEX chooses what it does: ok (the default), fail (answers FAILED), signin (not signed in), crash,
slow (hangs after planning), legacy (the older {"msg": ...} event lines)."""

import json
import os
import re
import sys
import time
from pathlib import Path


def emit(event: dict) -> None:
    print(json.dumps(event), flush=True)


ROOM = {"name": "Arcade", "line": "Coins and neon.", "dark": True,
        "colors": {"ground": "#0a0a12", "ground2": "#1a1030", "surface": "#101018", "ink": "#121220", "soft": "#8080a0", "accent": "#ff3fa4", "accent2": "#3ff0ff"},
        "type": "nonsense", "frame": "glow", "ornament": "bolt", "motifs": ["bolt", "star"], "set": "grid", "texture": "scanlines", "weather": "sparkles",
        "light": "night", "wipe": "scan", "sound": "synth", "motion": "crisp", "radius": "round",
        "voice": {"hello": {"morning": "Insert coin.", "afternoon": "Player two?", "evening": "High score time.", "night": "One more go."},
                  "placeholder": "Press start", "send": "Go", "stages": {"read": "Loading", "plan": "Choosing a level", "draw": "Drawing sprites", "finish": "Saving"}, "done": ["Level clear."]}}


def main(argv: list[str]) -> int:
    if argv == ["--version"]:
        print("codex-cli 0.0.0 (fake)")
        return 0
    if argv[:2] == ["login", "status"]:
        print("Signed in (fake)")
        return 0
    if argv[:2] == ["exec", "--help"]:
        print("Options: --json --skip-git-repo-check --cd -C --sandbox --model --config --image --output-schema --output-last-message")
        return 0
    if argv[:1] != ["exec"] or argv[-2:] != ["--", "-"]:
        print(f"fake codex: unexpected arguments {argv}", file=sys.stderr)
        return 64
    opt = lambda name: argv[argv.index(name) + 1] if name in argv else None
    workdir = Path(opt("-C"))
    (workdir / "fake-argv.json").write_text(json.dumps(argv), encoding="utf-8")
    brief = sys.stdin.read()
    mode = os.environ.get("FAKE_CODEX", "ok")
    if mode == "crash":
        print("thread 'main' panicked", file=sys.stderr)
        return 101
    if mode == "signin":
        print("Error: not logged in. Run codex login", file=sys.stderr)
        return 1
    legacy = mode == "legacy"

    def say(text: str) -> None:
        emit({"id": "1", "msg": {"type": "agent_message", "message": text}} if legacy else {"type": "item.completed", "item": {"id": "m", "type": "agent_message", "text": text}})

    def think(text: str) -> None:
        emit({"id": "0", "msg": {"type": "agent_reasoning", "text": text}} if legacy else {"type": "item.completed", "item": {"id": "r", "type": "reasoning", "text": text}})

    if not legacy:
        emit({"type": "thread.started", "thread_id": "fake-thread"})
        emit({"type": "turn.started"})
    think("**Reading the request**\n\nThey want something specific.")
    if opt("--output-schema"):
        props = json.loads(Path(opt("--output-schema")).read_text(encoding="utf-8"))["properties"]
        if "backdrops" in props:
            answer = {"backdrops": [{"name": f"Place {i}", "words": f"somewhere, number {i}"} for i in range(6)]}
        elif "ramp" in props:
            answer = {"name": "Rose Gold", "line": "Warm metal.", "prompt": "rose gold toning", "ramp": ["#ffffff", "#000000", "#c08080"], "keep": 2, "grain": .1, "bloom": .2, "vignette": .3}
        else:
            answer = ROOM
        if opt("-o"):
            Path(opt("-o")).write_text(json.dumps(answer), encoding="utf-8")
        say(json.dumps(answer))
        emit({"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 10}})
        return 0
    if mode == "fail":
        say('FAILED {"message": "That would need a real person\'s face.", "hint": "Try a drawn sitter."}')
        emit({"type": "turn.completed", "usage": {}})
        return 0
    n = int(re.search(r"Make (\d+) picture", brief).group(1))
    say('PLAN {"summary": "Painting three pears", "prompt": "three pears, blue cloth"}')
    emit({"type": "item.started", "item": {"id": "c", "type": "command_execution", "command": "make pictures", "status": "in_progress"}})
    if mode == "slow":
        time.sleep(60)
    from PIL import Image

    for i in range(n):
        Image.new("RGB", (64, 96), (40 * i, 120, 200)).save(workdir / "out" / f"{i + 1}.png")
        time.sleep(.05)
    emit({"type": "item.completed", "item": {"id": "c", "type": "command_execution", "command": "make pictures", "exit_code": 0, "status": "completed"}})
    say('DONE {"reply": "Three pears, as asked.", "suggestions": ["Warmer light", "Make it night", "Three variations"]}')
    emit({"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 10}})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
