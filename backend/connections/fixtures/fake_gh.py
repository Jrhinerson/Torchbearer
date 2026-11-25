"""Deterministic gh substitute. Never contacts GitHub or reads real credentials."""

import os
import sys
import time
from pathlib import Path

directory = Path(os.environ["GH_CONFIG_DIR"])
assert not any(os.environ.get(key) for key in ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN"])
if sys.argv[1:3] == ["auth", "login"]:
    assert "--web" in sys.argv and "--hostname" in sys.argv
    print("! First copy your one-time code: ABCD-1234", file=sys.stderr, flush=True)
    print(
        "Open this URL to continue in your web browser: https://github.com/login/device",
        file=sys.stderr,
        flush=True,
    )
    while not (directory / "approved.json").exists():
        if (directory / "denied").exists():
            print("access_denied secret-must-not-leak", file=sys.stderr)
            sys.exit(1)
        time.sleep(0.02)
    sys.exit(0)
if sys.argv[1] == "api":
    if (directory / "invalid").exists():
        print("HTTP 401 secret-must-not-leak", file=sys.stderr)
        sys.exit(1)
    print((directory / "approved.json").read_text(encoding="utf-8"))
    sys.exit(0)
sys.exit(2)
