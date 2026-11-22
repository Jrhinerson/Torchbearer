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
        if web_origin := os.environ.get("TORCHBEARER_TEST_WEB_ORIGIN"):
            settings.CSRF_TRUSTED_ORIGINS = [*settings.CSRF_TRUSTED_ORIGINS, web_origin]
        call_command("migrate", interactive=False, verbosity=0)

        def stop(signum, frame):
            raise SystemExit(0)

        signal.signal(signal.SIGTERM, stop)
        try:
            port = os.environ.get("TORCHBEARER_TEST_API_PORT", "8000")
            call_command("runserver", f"127.0.0.1:{port}", use_reloader=False)
        finally:
            connections.close_all()


if __name__ == "__main__":
    main()
