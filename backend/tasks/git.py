import os
import subprocess
from pathlib import Path


def git(path, *args, timeout=30):
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    try:
        result = subprocess.run(
            ["git", "-C", str(path), *args],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Git could not complete the operation.") from error
    if result.returncode:
        raise ValueError(result.stderr.strip()[:1000] or "Git operation failed.")
    return result.stdout.strip()


def repository_path(value):
    try:
        path = Path(value).expanduser().resolve(strict=True)
    except (OSError, ValueError) as error:
        raise ValueError("Enter an existing local Git repository path.") from error
    if not path.is_dir():
        raise ValueError("Choose a repository directory.")
    root = Path(git(path, "rev-parse", "--show-toplevel")).resolve()
    if root != path:
        raise ValueError("Choose the repository root directory.")
    git(path, "rev-parse", "--verify", "HEAD")
    return str(path)
