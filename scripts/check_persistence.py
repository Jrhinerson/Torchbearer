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
from pathlib import Path

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
        repository = Path(data_dir) / "fixture repository"
        repository.mkdir()
        (repository / "README.md").write_text("Persistence fixture\n", encoding="utf-8")
        for arguments in [
            ["init", "-b", "main"],
            ["add", "README.md"],
            [
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "commit",
                "-m",
                "Fixture",
            ],
        ]:
            subprocess.run(["git", *arguments], cwd=repository, check=True, capture_output=True)
        for agent in ["codex", "claude", "pi"]:
            env[f"TORCHBEARER_{agent.upper()}_COMMAND"] = json.dumps(
                [str(PYTHON), str(ROOT / "backend/tasks/fixtures/fake_cli.py"), agent, "implement"]
            )
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
                data=json.dumps({"name": "Persistent project", "path": str(repository)}).encode(),
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
                        "work_type": "bug",
                    }
                ).encode(),
                headers={"Content-Type": "application/json", "X-CSRFToken": token},
                method="POST",
            )
            with opener.open(request, timeout=3) as response:
                assert response.status == 201
                saved = json.load(response)
            with opener.open(f"{url}/api/v1/work-types/bug/", timeout=3) as response:
                assignment = json.load(response)
            assignment_request = urllib.request.Request(
                f"{url}/api/v1/work-types/bug/",
                data=json.dumps(
                    {"assigned_workflow": "test-driven", "revision": assignment["revision"]}
                ).encode(),
                headers={"Content-Type": "application/json", "X-CSRFToken": token},
                method="PATCH",
            )
            with opener.open(assignment_request, timeout=3) as response:
                assert response.status == 200
                saved_assignment = json.load(response)
            graph_url = f"{url}/api/v1/workflows/plan-execute/graph/"
            with opener.open(graph_url, timeout=3) as response:
                graph_detail = json.load(response)
            graph = graph_detail["graph"]
            graph["nodes"][2]["description"] = "Retain this edited validation requirement."
            graph["nodes"][2]["position"] = {"x": 750, "y": 90}
            graph["nodes"][2]["requirements"][2]["applicability_note"] = (
                "When documentation changes are included."
            )
            graph_request = urllib.request.Request(
                graph_url,
                data=json.dumps({"graph": graph, "revision": graph_detail["revision"]}).encode(),
                headers={"Content-Type": "application/json", "X-CSRFToken": token},
                method="PATCH",
            )
            with opener.open(graph_request, timeout=3) as response:
                assert response.status == 200
                saved_graph = json.load(response)

            def post(endpoint, payload):
                request = urllib.request.Request(
                    f"{url}/api/v1/{endpoint}",
                    data=json.dumps(payload).encode(),
                    headers={"Content-Type": "application/json", "X-CSRFToken": token},
                    method="POST",
                )
                with opener.open(request, timeout=5) as response:
                    return json.load(response)

            discovery = post(
                "tasks/",
                {
                    "title": "Persist an accepted decision",
                    "project_id": project["id"],
                    "work_type": "research",
                },
            )
            post(
                f"tasks/{discovery['id']}/actions/",
                {"action": "start", "revision": discovery["revision"]},
            )
            for _ in range(3):
                run([str(PYTHON), "backend/manage.py", "runagentworker", "--once"], env=env)
                with opener.open(f"{url}/api/v1/tasks/{discovery['id']}/", timeout=5) as response:
                    discovery = json.load(response)
                with opener.open(
                    f"{url}/api/v1/tasks/{discovery['id']}/runs/", timeout=5
                ) as response:
                    history = json.load(response)
                attempt = history["runs"][0]
                assert attempt["state"] == "succeeded", attempt["error"]
                discovery = post(
                    f"tasks/{discovery['id']}/actions/",
                    {
                        "action": "approve",
                        "revision": discovery["revision"],
                        "run_id": attempt["id"],
                        "fingerprint": attempt["review_fingerprint"],
                    },
                )
            discovery = post(
                f"tasks/{discovery['id']}/actions/",
                {
                    "action": "final_approve",
                    "revision": discovery["revision"],
                    "run_id": attempt["id"],
                    "fingerprint": attempt["review_fingerprint"],
                },
            )
            accepted_history = history
        finally:
            stop_process(process)

        process = start()
        try:
            with opener.open(f"{url}/api/v1/tasks/", timeout=3) as response:
                tasks = json.load(response)
            assert len(tasks) == 2
            restored_discovery = next(task for task in tasks if task["id"] == discovery["id"])
            assert restored_discovery["completed_at"] == discovery["completed_at"]
            assert restored_discovery["workflow_snapshot"] == discovery["workflow_snapshot"]
            with opener.open(f"{url}/api/v1/tasks/{discovery['id']}/runs/", timeout=5) as response:
                restored_history = json.load(response)
            assert restored_history["runs"] == accepted_history["runs"]
            assert restored_history["runs"][1]["result"]["artifacts"]["decision"]["options"]
            assert restored_history["runs"][1]["result"]["workflow_steps"]
            assert any(
                decision["action"] == "final_approve" for decision in restored_history["decisions"]
            )
            tasks = [task for task in tasks if task["id"] == saved["id"]]
            assert tasks[0]["id"] == saved["id"]
            assert tasks[0]["title"] == saved["title"]
            assert tasks[0]["routing_mode"] == "hybrid"
            assert tasks[0]["frontier_agent"] == "claude"
            assert tasks[0]["workflow_snapshot"] == saved["workflow_snapshot"]
            assert tasks[0]["workflow_snapshot"]["key"] == "diagnose-regression"
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
            with opener.open(f"{url}/api/v1/work-types/bug/", timeout=3) as response:
                assignment = json.load(response)
            assert assignment["assigned_workflow"] == "test-driven"
            assert assignment["recommended_workflow"] == "diagnose-regression"
            assert assignment["revision"] == saved_assignment["revision"]
            with opener.open(graph_url, timeout=3) as response:
                assert json.load(response) == saved_graph
        finally:
            stop_process(process)
    print(
        "PASS: SQLite retained tasks, snapshots, step evidence, accepted decisions, projects, "
        "workflow defaults, and edited DAGs across a backend restart."
    )


if __name__ == "__main__":
    main()
