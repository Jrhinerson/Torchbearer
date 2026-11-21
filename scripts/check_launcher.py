"""Check that the shared launcher starts both services and stops them together."""

import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from check_persistence import wait_for_service
from common import PYTHON, ROOT, require_environment, require_tools, run
from dev import check_port, stop_process


def port_is_closed(port):
    with socket.socket() as probe:
        probe.settimeout(0.2)
        return probe.connect_ex(("127.0.0.1", port)) != 0


def main():
    require_environment()
    require_tools()
    check_port(8000)
    check_port(5173)
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
                [sys.executable, "scripts/dev.py"],
                cwd=ROOT,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                **options,
            )
            try:
                wait_for_service("http://127.0.0.1:8000", process)
                wait_for_service("http://127.0.0.1:5173", process)
                shutdown_signal = (
                    signal.CTRL_BREAK_EVENT if sys.platform == "win32" else signal.SIGTERM
                )
                process.send_signal(shutdown_signal)
                process.wait(timeout=10)
                deadline = time.monotonic() + 5
                while not (port_is_closed(8000) and port_is_closed(5173)):
                    if time.monotonic() > deadline:
                        raise RuntimeError("The launcher left a local service running.")
                    time.sleep(0.1)
                assert process.returncode == 0
            finally:
                stop_process(process)
    print("PASS: The launcher started both services and stopped both process trees.")


if __name__ == "__main__":
    main()
