"""Exercise hard worker death against a real, isolated SQLite database and process tree."""

import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db
ROOT = Path(__file__).resolve().parents[2]
FAKE = ROOT / "backend/tasks/fixtures/fake_cli.py"
SEED = """
import json, os, sys
sys.path.insert(0, 'backend')
import django
django.setup()
from django.core.management import call_command
call_command('migrate', interactive=False, verbosity=0)
from tasks.models import Repository, Task
from tasks.workflow import act
repository = Repository.objects.create(
    name='Recovery fixture', path=os.environ['TEST_REPOSITORY_PATH']
)
ids = []
for title in ['Interrupted task', 'Queued task']:
    task = Task.objects.create(title=title, repository=repository)
    act(task.id, action='start', revision=0)
    ids.append(str(task.id))
print(json.dumps(ids))
"""


def test_hard_worker_exit_kills_children_and_preserves_the_queue(repository, tmp_path):
    data = tmp_path / "recovery data"
    env = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings",
        "TORCHBEARER_DATA_DIR": str(data),
        "TORCHBEARER_CODEX_COMMAND": json.dumps([sys.executable, str(FAKE), "codex", "hang"]),
        "TEST_REPOSITORY_PATH": repository.path,
    }
    seeded = subprocess.run(
        [sys.executable, "-c", SEED], cwd=ROOT, env=env, capture_output=True, text=True, timeout=20
    )
    assert seeded.returncode == 0, seeded.stderr
    first, second = json.loads(seeded.stdout)
    command = [sys.executable, "backend/manage.py", "runagentworker"]
    with (tmp_path / "worker.log").open("w", encoding="utf-8") as log:
        worker = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=log)
        try:
            heartbeat = data / "workspaces" / first / "heartbeat.txt"
            deadline = time.monotonic() + 20
            while not heartbeat.exists():
                assert worker.poll() is None, "The worker exited before launching its agent."
                assert time.monotonic() < deadline, "The fake agent did not start."
                time.sleep(0.05)
            worker.kill()  # Intentionally kill only the worker, not its descendants.
            worker.wait(timeout=10)
            time.sleep(0.3)
            stopped = heartbeat.read_text()
            time.sleep(0.3)
            assert heartbeat.read_text() == stopped, "An agent descendant outlived its worker."
        finally:
            if worker.poll() is None:
                worker.kill()
                worker.wait(timeout=10)
    env["TORCHBEARER_CODEX_COMMAND"] = json.dumps([sys.executable, str(FAKE), "codex", "normal"])
    resumed = subprocess.run(
        [*command, "--once"], cwd=ROOT, env=env, capture_output=True, text=True, timeout=20
    )
    assert resumed.returncode == 0, resumed.stderr
    with sqlite3.connect(data / "torchbearer.sqlite3") as connection:
        states = dict(connection.execute("SELECT task_id, state FROM tasks_agentrun"))
    assert states == {first.replace("-", ""): "interrupted", second.replace("-", ""): "succeeded"}
