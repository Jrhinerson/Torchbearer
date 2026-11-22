"""Verify the launcher stops the backend, frontend, and agent worker together."""

import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from check_persistence import wait_for_service
from common import PYTHON, ROOT, require_environment, require_tools, run
from dev import stop_process


def port_is_closed(port):
    with socket.socket() as probe:
        probe.settimeout(0.2)
        return probe.connect_ex(("127.0.0.1", port)) != 0


def main():
    require_environment()
    require_tools()
    with socket.socket() as backend, socket.socket() as frontend:
        backend.bind(("127.0.0.1", 0))
        frontend.bind(("127.0.0.1", 0))
        backend_port, frontend_port = backend.getsockname()[1], frontend.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="torchbearer-launcher-") as data_dir:
        env = {**os.environ, "TORCHBEARER_DATA_DIR": data_dir}
        run([str(PYTHON), "backend/manage.py", "migrate", "--noinput"], env=env)
        options = (
            {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
            if sys.platform == "win32"
            else {"start_new_session": True}
        )
        with (Path(data_dir) / "launcher.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "scripts/dev.py",
                    "--backend-port",
                    str(backend_port),
                    "--frontend-port",
                    str(frontend_port),
                ],
                cwd=ROOT,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                **options,
            )
            try:
                wait_for_service(f"http://127.0.0.1:{backend_port}", process)
                wait_for_service(f"http://127.0.0.1:{frontend_port}", process)
                deadline = time.monotonic() + 10
                while True:
                    with urllib.request.urlopen(
                        f"http://127.0.0.1:{backend_port}/api/v1/routing/", timeout=2
                    ) as response:
                        if json.load(response)["worker"]["available"]:
                            break
                    if time.monotonic() > deadline:
                        raise RuntimeError("The launcher did not start the agent worker.")
                    time.sleep(0.1)
                shutdown_signal = (
                    signal.CTRL_BREAK_EVENT if sys.platform == "win32" else signal.SIGTERM
                )
                process.send_signal(shutdown_signal)
                process.wait(timeout=10)
                deadline = time.monotonic() + 5
                while not (port_is_closed(backend_port) and port_is_closed(frontend_port)):
                    if time.monotonic() > deadline:
                        raise RuntimeError("The launcher left a local service running.")
                    time.sleep(0.1)
                assert process.returncode == 0
                # A new worker can acquire the OS lock only once the launcher's worker has exited.
                probe = subprocess.run(
                    [str(PYTHON), "backend/manage.py", "runagentworker", "--once"],
                    cwd=ROOT,
                    env=env,
                    capture_output=True,
                    timeout=10,
                )
                assert probe.returncode == 0, probe.stderr.decode(errors="replace")
            finally:
                stop_process(process)
    print("PASS: The launcher started and stopped the backend, frontend, and agent worker.")


if __name__ == "__main__":
    main()
