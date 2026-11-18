"""likeness: one command for the studio.

  serve          start the studio (the app, its API and an engine) and print how a phone reaches it
  probe codex    check that Codex CLI is here, signed in, and speaks the flags the studio uses; --smoke makes a picture
  relay          run a relay packet
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
from pathlib import Path

from . import __version__, paths


def _lan_address() -> str:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def _write(report: dict, out: str | None) -> None:
    text = json.dumps(report, indent=2)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text, encoding="utf-8")
    print(text)


def serve(args) -> int:
    import uvicorn

    from . import engines, settings
    from .server import create_app, pairing_key

    home = paths.home()
    config = settings.load(home)
    engine = engines.create(args.engine or config["studio"].get("engine", "auto"), config, home)
    app = create_app(engine, home=home, open_door=args.open, config=config)
    local, phone = f"http://127.0.0.1:{args.port}/", f"http://{_lan_address()}:{args.port}/?pair={pairing_key(home)}"
    honest = "  (every picture is a stand-in, stamped as one)" if engine.kind == "simulator" else ""
    print(f"\n  Likeness {__version__}  ·  {engine.describe()['label']}{honest}\n\n  On this machine   {local}\n  On your phone     {phone}\n")
    try:
        import segno

        segno.make(phone, error="m").terminal(compact=True, border=2)
    except Exception:
        pass
    print("  The phone must be on the same network. Scan the code once; it stays paired.\n  Ctrl+C stops the studio.\n", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    return 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):   # Windows consoles default to a code page that cannot print ·, × or a QR block
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    parser = argparse.ArgumentParser(prog="likeness", description="Likeness: a personal image studio you talk to.")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("serve", help="start the studio")
    p.add_argument("--engine", default="", help="auto, simulator or codex (default: studio.toml, then auto)")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--open", action="store_true", help="let any device on the network in without pairing")

    p = sub.add_parser("probe", help="check an engine on this machine")
    p.add_argument("engine", choices=["codex"])
    p.add_argument("--smoke", action="store_true", help="also make pictures through the real engine and time them")
    p.add_argument("--out", help="write the report here too (pictures go beside it)")

    p = sub.add_parser("relay", help="run a relay packet")
    p.add_argument("action", choices=["run", "pending"])
    p.add_argument("packet", nargs="?", default="")
    p.add_argument("--only", action="append")

    args = parser.parse_args(argv)
    if args.command == "serve":
        return serve(args)
    if args.command == "probe":
        from . import settings
        from .engines import codex

        report = codex.probe(settings.load().get("codex", {}), smoke=args.smoke, out=Path(args.out).parent if args.out else None)
        _write(report, args.out)
        return 0 if report["ok"] else 1
    from . import relay

    if args.action == "pending":
        print("\n".join(p.name for p in relay.pending()) or "No pending packets.")
        return 0
    waiting = relay.pending()
    if not args.packet and not waiting:
        print("No pending packets.")
        return 0
    status = relay.run(args.packet or waiting[0].name, args.only)
    return 0 if not status["stopped_at"] else 1
