"""Playwright's backend: a fresh SQLite database, never the developer's data."""

import json
import os
import signal
import subprocess
import sys
import tempfile

from common import ROOT
from dev import stop_process


def main():
    with tempfile.TemporaryDirectory(prefix="torchbearer-browser-") as data_dir:
        os.environ["TORCHBEARER_DATA_DIR"] = data_dir
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
        sys.path.insert(0, str(ROOT / "backend"))
        import django
        from django.core.management import call_command
        from django.db import connections

        django.setup()
        backend_port = int(os.environ.get("TORCHBEARER_BACKEND_PORT", "18000"))
        call_command("migrate", interactive=False, verbosity=0)
        from pathlib import Path

        from tasks.git import git
        from tasks.models import Repository

        repository = Path(data_dir) / "browser repository"
        repository.mkdir()
        git(repository, "init", "-b", "main")
        (repository / "README.md").write_text("Browser fixture\n", encoding="utf-8")
        git(repository, "add", "README.md")
        git(
            repository,
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "-m",
            "Initial",
        )
        Repository.objects.create(name="Browser fixture repository", path=str(repository))
        for agent in ["codex", "claude", "pi"]:
            os.environ[f"TORCHBEARER_{agent.upper()}_COMMAND"] = json.dumps(
                [sys.executable, str(ROOT / "backend/tasks/fixtures/fake_cli.py"), agent, "browser"]
            )
        options = (
            {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
            if sys.platform == "win32"
            else {"start_new_session": True}
        )
        worker = subprocess.Popen(
            [sys.executable, str(ROOT / "backend/manage.py"), "runagentworker"],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            **options,
        )

        def stop(signum, frame):
            raise SystemExit(0)

        signal.signal(signal.SIGTERM, stop)
        try:
            call_command("runserver", f"127.0.0.1:{backend_port}", use_reloader=False)
        finally:
            stop_process(worker)
            connections.close_all()


if __name__ == "__main__":
    main()
