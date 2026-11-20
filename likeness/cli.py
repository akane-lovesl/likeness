"""likeness: one command for the studio.

  serve          start the studio (the app, its API and an engine) and print how a phone reaches it
  probe codex    check that Codex CLI is here, signed in, and speaks the flags the studio uses; --smoke makes a picture
  relay          run a relay packet
  examples       make the Lookbook's example people through the engine (portraits, looks, angles) into web/examples
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
    scheme = "https" if args.cert and args.key else "http"
    local = f"{scheme}://127.0.0.1:{args.port}/"
    honest = "  (every picture is a stand-in, stamped as one)" if engine.kind == "simulator" else ""
    print(f"\n  Likeness {__version__}  ·  {engine.describe()['label']}{honest}\n\n  On this machine   {local}\n")
    if args.host not in {"localhost", "127.0.0.1", "::1"}:
        phone = f"{scheme}://{_lan_address()}:{args.port}/?pair={pairing_key(home)}"
        print(f"  On your phone     {phone}\n")
        try:
            import segno

            segno.make(phone, error="m").terminal(compact=True, border=2)
        except Exception:
            pass
        print("  The phone must be on the same network. Scan the code once; it stays paired.")
    print("  Ctrl+C stops the studio.\n", flush=True)
    tls = {"ssl_certfile": args.cert, "ssl_keyfile": args.key} if scheme == "https" else {}
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", access_log=False, **tls)
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
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--open", action="store_true", help="let any device on the network in without pairing")
    p.add_argument("--cert", default="", help="a TLS certificate (PEM), to serve over HTTPS: phones only allow the camera on a secure origin")
    p.add_argument("--key", default="", help="the certificate's private key (PEM)")

    p = sub.add_parser("probe", help="check an engine on this machine")
    p.add_argument("engine", choices=["codex"])
    p.add_argument("--smoke", action="store_true", help="also make pictures through the real engine and time them")
    p.add_argument("--out", help="write the report here too (pictures go beside it)")

    p = sub.add_parser("examples", help="make the Lookbook's example people through the engine")
    p.add_argument("--cast", default="", help="the people and their looks (default: relay/0004-lookbook/cast.toml)")
    p.add_argument("--out", default="", help="where the app reads them (default: web/examples)")
    p.add_argument("--engine", default="", help="codex or simulator (default: studio.toml, then auto)")
    p.add_argument("--pace", default="fine", choices=["quick", "fine", "deep"])
    p.add_argument("--only", action="append", help="one person's id; may be given more than once")
    p.add_argument("--fresh", action="store_true", help="make everything again, even what is already on disk")
    p.add_argument("--report", default="", help="write the turns and their times here as JSON")

    p = sub.add_parser("relay", help="run a relay packet")
    p.add_argument("action", choices=["run", "pending"])
    p.add_argument("packet", nargs="?", default="")
    p.add_argument("--only", action="append")

    args = parser.parse_args(argv)
    if args.command == "serve":
        return serve(args)
    if args.command == "examples":
        from . import engines, examples, settings

        home = paths.home()
        config = settings.load(home)
        engine = engines.create(args.engine or config["studio"].get("engine", "auto"), config, home)
        cast = examples.load_cast(Path(args.cast) if args.cast else examples.CAST)
        print(f"Making the Lookbook's examples with {engine.describe()['label']}")
        done = examples.make(cast, engine, Path(args.out) if args.out else examples.OUT, home, args.pace, args.only, args.fresh)
        if args.report:
            _write({"by": done["manifest"].get("by"), "kind": done["manifest"].get("kind"), "turns": done["turns"]}, args.report)
        return 0
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
