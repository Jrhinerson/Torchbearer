"""Playwright's backend: a fresh SQLite database, never the developer's data."""

import os
import signal
import sys
import tempfile

from common import ROOT


def main():
    with tempfile.TemporaryDirectory(prefix="torchbearer-browser-") as data_dir:
        os.environ["TORCHBEARER_DATA_DIR"] = data_dir
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
        sys.path.insert(0, str(ROOT / "backend"))
        import django
        from django.conf import settings
        from django.core.management import call_command
        from django.db import connections

        django.setup()
        port = os.environ.get("TORCHBEARER_TEST_BACKEND_PORT", "8001")
        frontend_port = os.environ.get("TORCHBEARER_TEST_FRONTEND_PORT", "5174")
        settings.CSRF_TRUSTED_ORIGINS = [f"http://127.0.0.1:{frontend_port}"]
        call_command("migrate", interactive=False, verbosity=0)

        def stop(signum, frame):
            raise SystemExit(0)

        signal.signal(signal.SIGTERM, stop)
        try:
            call_command("runserver", f"127.0.0.1:{port}", use_reloader=False)
        finally:
            connections.close_all()


if __name__ == "__main__":
    main()
