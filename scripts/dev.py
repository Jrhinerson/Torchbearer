"""Start local services, forwarding Ctrl+C and cleaning up their process trees."""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time

from common import PYTHON, ROOT, require_environment, require_tools, run


def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as error:
            raise SystemExit(f"Port {port} is already in use. Stop that service first.") from error


def stop_process(process):
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if sys.platform == "win32":
            process.kill()
        else:
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-only", action="store_true")
    args = parser.parse_args()
    node, _ = require_tools()
    require_environment()
    vite = ROOT / "frontend/node_modules/vite/bin/vite.js"
    if not args.backend_only and not vite.is_file():
        raise SystemExit("Frontend dependencies are missing. Run: python scripts/setup.py")

    check_port(8000)
    if not args.backend_only:
        check_port(5173)
    run([str(PYTHON), "backend/manage.py", "migrate", "--check"])
    commands = [
        ([str(PYTHON), "backend/manage.py", "runserver", "127.0.0.1:8000", "--noreload"], ROOT),
        ([str(PYTHON), "backend/manage.py", "runagentworker"], ROOT),
    ]
    if not args.backend_only:
        commands.append(([node, str(vite)], ROOT / "frontend"))
    options = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if sys.platform == "win32"
        else {"start_new_session": True}
    )
    processes = []

    def interrupt(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupt)
    if sys.platform == "win32":
        signal.signal(signal.SIGBREAK, interrupt)
    try:
        for command, cwd in commands:
            processes.append(
                subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL, **options)
            )
        port = 8000 if args.backend_only else 5173
        print(f"\nTorchbearer: http://127.0.0.1:{port}\nPress Ctrl+C to stop.\n", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.2)
        exit_code = next(process.returncode for process in processes if process.poll() is not None)
        if exit_code:
            raise SystemExit(exit_code)
    except KeyboardInterrupt:
        print("\nStopping Torchbearer...", flush=True)
    finally:
        for process in reversed(processes):
            stop_process(process)


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Startup failed: {error}", file=sys.stderr)
        sys.exit(1)
