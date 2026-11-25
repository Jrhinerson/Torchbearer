"""Verify SQLite persistence across a real server restart using temporary data."""

import http.cookiejar
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from common import PYTHON, ROOT, require_environment, run
from dev import stop_process


def wait_for_service(url, process):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("The test service exited before becoming ready.")
        try:
            with urllib.request.urlopen(f"{url}/api/v1/health/", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError, urllib.error.URLError:
            time.sleep(0.1)
    raise RuntimeError("The test service did not become ready within 20 seconds.")


def main():
    require_environment()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    options = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if sys.platform == "win32"
        else {"start_new_session": True}
    )
    with tempfile.TemporaryDirectory(prefix="torchbearer-restart-") as data_dir:
        env = {**os.environ, "TORCHBEARER_DATA_DIR": data_dir}
        run([str(PYTHON), "backend/manage.py", "migrate", "--noinput"], env=env)
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

        def start():
            process = subprocess.Popen(
                [str(PYTHON), "backend/manage.py", "runserver", f"127.0.0.1:{port}", "--noreload"],
                cwd=ROOT,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
                **options,
            )
            try:
                wait_for_service(url, process)
            except BaseException:
                stop_process(process)
                raise
            return process

        process = start()
        try:
            with opener.open(f"{url}/api/v1/csrf/", timeout=3) as response:
                token = json.load(response)["csrfToken"]
            project_request = urllib.request.Request(
                f"{url}/api/v1/projects/",
                data=json.dumps({"name": "Persistent project", "path": str(ROOT)}).encode(),
                headers={"Content-Type": "application/json", "X-CSRFToken": token},
                method="POST",
            )
            with opener.open(project_request, timeout=3) as response:
                assert response.status == 201
                project = json.load(response)
            request = urllib.request.Request(
                f"{url}/api/v1/tasks/",
                data=json.dumps(
                    {
                        "title": "Persist after a process restart",
                        "routing_mode": "hybrid",
                        "frontier_agent": "claude",
                        "project_id": project["id"],
                    }
                ).encode(),
                headers={"Content-Type": "application/json", "X-CSRFToken": token},
                method="POST",
            )
            with opener.open(request, timeout=3) as response:
                assert response.status == 201
                saved = json.load(response)
        finally:
            stop_process(process)

        process = start()
        try:
            with opener.open(f"{url}/api/v1/tasks/", timeout=3) as response:
                tasks = json.load(response)
            assert len(tasks) == 1
            assert tasks[0]["id"] == saved["id"]
            assert tasks[0]["title"] == saved["title"]
            assert tasks[0]["routing_mode"] == "hybrid"
            assert tasks[0]["frontier_agent"] == "claude"
            assert tasks[0]["stage_agents"] == {
                "plan": "claude",
                "integrate": "pi",
                "code_review": "claude",
                "refine": "claude",
                "retro": "claude",
            }
            assert tasks[0]["project"]["id"] == project["id"]
            with opener.open(f"{url}/api/v1/projects/", timeout=3) as response:
                assert json.load(response)[0]["id"] == project["id"]
        finally:
            stop_process(process)
    print("PASS: SQLite retained the task, project and association across a backend restart.")


if __name__ == "__main__":
    main()
