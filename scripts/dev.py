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


def port_number(value):
    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Ports must be between 1 and 65535.")
    return port


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
    parser.add_argument("--backend-port", type=port_number, default=8000)
    parser.add_argument("--frontend-port", type=port_number, default=5173)
    args = parser.parse_args()
    node, _ = require_tools()
    require_environment()
    vite = ROOT / "frontend/node_modules/vite/bin/vite.js"
    if not args.backend_only and not vite.is_file():
        raise SystemExit("Frontend dependencies are missing. Run: python scripts/setup.py")

    check_port(args.backend_port)
    if not args.backend_only:
        check_port(args.frontend_port)
        if args.frontend_port == args.backend_port:
            raise SystemExit("The backend and frontend need different ports.")
    env = {
        **os.environ,
        "TORCHBEARER_BACKEND_PORT": str(args.backend_port),
        "TORCHBEARER_FRONTEND_PORT": str(args.frontend_port),
    }
    run([str(PYTHON), "backend/manage.py", "migrate", "--check"])
    commands = [
        (
            [
                str(PYTHON),
                "backend/manage.py",
                "runserver",
                f"127.0.0.1:{args.backend_port}",
                "--noreload",
            ],
            ROOT,
        ),
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
                subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL, **options)
            )
        port = args.backend_port if args.backend_only else args.frontend_port
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
