"""Run the project's portable static, migration, API, and frontend checks."""

import subprocess
import sys

from common import PYTHON, require_environment, require_tools, run


def main():
    require_environment()
    _, npm = require_tools()
    commands = [
        [str(PYTHON), "-m", "ruff", "check", "backend", "scripts"],
        [str(PYTHON), "-m", "ruff", "format", "--check", "backend", "scripts"],
        [str(PYTHON), "backend/manage.py", "check"],
        [str(PYTHON), "backend/manage.py", "makemigrations", "--check", "--dry-run"],
        [str(PYTHON), "backend/manage.py", "migrate", "--check"],
        [str(PYTHON), "-m", "pytest", "-q"],
        [npm, "run", "format:check", "--prefix", "frontend"],
        [npm, "run", "lint", "--prefix", "frontend"],
        [npm, "run", "build", "--prefix", "frontend"],
    ]
    for command in commands:
        run(command)
    print("\nAll static, migration, API, and frontend checks passed.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        sys.exit(1)
