"""Launch an isolated, read-only populated demo. No agent worker is started."""

import argparse
import os
import signal
import subprocess
import sys
import tempfile

from common import ROOT, require_environment, require_tools
from dev import check_port, port_number, stop_process


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-only", action="store_true")
    parser.add_argument(
        "--backend-port", type=port_number, default=os.environ.get("TORCHBEARER_BACKEND_PORT", 8001)
    )
    parser.add_argument(
        "--frontend-port",
        type=port_number,
        default=os.environ.get("TORCHBEARER_FRONTEND_PORT", 5174),
    )
    args = parser.parse_args()
    require_environment()
    node, _ = require_tools()
    check_port(args.backend_port)
    if not args.backend_only:
        check_port(args.frontend_port)
    with tempfile.TemporaryDirectory(prefix="torchbearer-demo-") as directory:
        os.environ.update(
            TORCHBEARER_DATA_DIR=directory,
            TORCHBEARER_DEMO="1",
            DJANGO_SETTINGS_MODULE="config.settings",
            TORCHBEARER_GITHUB_CLIENT_ID="",
            TORCHBEARER_BACKEND_PORT=str(args.backend_port),
            TORCHBEARER_FRONTEND_PORT=str(args.frontend_port),
        )
        sys.path.insert(0, str(ROOT / "backend"))
        import django

        django.setup()
        from django.core.management import call_command
        from django.db import connections

        call_command("migrate", interactive=False, verbosity=0)
        call_command("seed_operations_demo")
        processes = []

        def stop(*_):
            raise KeyboardInterrupt

        for signum in [signal.SIGINT, signal.SIGTERM]:
            signal.signal(signum, stop)
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, stop)
        try:
            if not args.backend_only:
                options = (
                    {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
                    if sys.platform == "win32"
                    else {"start_new_session": True}
                )
                processes.append(
                    subprocess.Popen(
                        [node, str(ROOT / "frontend/node_modules/vite/bin/vite.js")],
                        cwd=ROOT / "frontend",
                        stdin=subprocess.DEVNULL,
                        **options,
                    )
                )
                print(f"Read-only demo: http://127.0.0.1:{args.frontend_port}", flush=True)
            call_command("runserver", f"127.0.0.1:{args.backend_port}", use_reloader=False)
        except KeyboardInterrupt:
            pass
        finally:
            for process in processes:
                stop_process(process)
            connections.close_all()


if __name__ == "__main__":
    main()
