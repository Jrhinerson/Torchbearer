"""Install locked dependencies and apply migrations without replacing local data."""

import subprocess
import sys
import venv

from common import PYTHON, ROOT, require_tools, run


def main():
    _, npm = require_tools()
    if not PYTHON.is_file():
        print("Creating the project Python environment...", flush=True)
        venv.EnvBuilder(with_pip=True).create(ROOT / ".venv")
    run([str(PYTHON), "-m", "pip", "install", "-r", "backend/requirements.txt"])
    run([npm, "ci", "--prefix", "frontend"])
    run([str(PYTHON), "backend/manage.py", "migrate", "--noinput"])
    print("\nSetup complete. Start Torchbearer with: python scripts/dev.py", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Setup failed: {error}", file=sys.stderr)
        sys.exit(1)
