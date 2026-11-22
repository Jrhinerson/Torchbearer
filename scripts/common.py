"""Paths and checks shared by the local development commands."""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = ROOT / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def require_tools():
    if sys.version_info[:2] != (3, 14):
        raise SystemExit("Torchbearer requires Python 3.14. Run this command with Python 3.14.")
    node = shutil.which("node")
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if not node or not npm:
        raise SystemExit("Install Node.js 24 or newer, including npm, before running this command.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if int(version.lstrip("v").split(".")[0]) < 24:
        raise SystemExit(f"Node.js 24 or newer is required; found {version}.")
    return node, npm


def require_environment():
    if not PYTHON.is_file():
        raise SystemExit("The project environment is missing. Run: python scripts/setup.py")


def run(command, **kwargs):
    print(f"\n> {' '.join(str(part) for part in command)}", flush=True)
    subprocess.run(command, cwd=ROOT, check=True, **kwargs)
