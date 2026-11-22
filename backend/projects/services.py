"""Local folder operations for projects; no repository is published or pushed."""

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from rest_framework.exceptions import ValidationError


def resolve_folder(value):
    try:
        folder = Path(value).expanduser()
        if not folder.is_absolute():
            raise ValidationError(
                {"path": ["Enter an absolute folder path or a path starting with ~."]}
            )
        folder = folder.resolve(strict=True)
        if not folder.is_dir():
            raise OSError
        return folder
    except OSError, RuntimeError, ValueError:
        raise ValidationError({"path": ["Choose an existing, accessible local folder."]}) from None


def is_repository(folder):
    """Recognize checkout and worktree markers without running Git for every row."""
    try:
        marker = folder / ".git"
        return marker.is_dir() or marker.is_file()
    except OSError:
        return False


def folder_locations():
    home = Path.home()
    candidates = [("Home", home)]
    candidates.extend((name, home / name) for name in ["Desktop", "Documents", "Downloads"])
    drives = os.listdrives() if hasattr(os, "listdrives") else [home.anchor]
    candidates.extend((drive, Path(drive)) for drive in drives)
    locations = []
    seen = set()
    for name, path in candidates:
        try:
            path = path.resolve(strict=True)
            if path.is_dir() and path not in seen:
                locations.append({"name": name, "path": str(path)})
                seen.add(path)
        except OSError, RuntimeError:
            continue
    return locations


def browse_folders(value=None):
    folder = resolve_folder(value or str(Path.home()))
    entries = []
    try:
        for child in folder.iterdir():
            try:
                if not child.name.startswith(".") and child.is_dir():
                    entries.append(
                        {
                            "name": child.name,
                            "path": str(child),
                            "is_repository": is_repository(child),
                        }
                    )
            except OSError:
                continue
    except OSError:
        raise ValidationError(
            {"path": ["This folder cannot be read. Choose another folder."]}
        ) from None
    return {
        "path": str(folder),
        "parent": str(folder.parent) if folder.parent != folder else None,
        "is_repository": is_repository(folder),
        "breadcrumbs": [
            {"name": part.name or part.anchor, "path": str(part)}
            for part in [*reversed(folder.parents), folder]
        ],
        "locations": folder_locations(),
        "folders": sorted(
            entries, key=lambda entry: (not entry["is_repository"], entry["name"].casefold())
        ),
    }


def validate_git_url(value):
    if any(character.isspace() or ord(character) < 32 for character in value):
        raise ValidationError({"url": ["Enter a valid HTTPS or SSH Git URL."]})
    try:
        url = urlsplit(value)
        valid_url = (
            url.scheme in {"https", "ssh"}
            and url.hostname
            and url.path.strip("/")
            and not url.password
            and not url.query
            and not url.fragment
            and (url.scheme != "https" or not url.username)
        )
        valid_scp = re.fullmatch(r"[\w.-]+@[\w.-]+:[\w./~-]+", value)
        if valid_url or valid_scp:
            return value
    except ValueError:
        pass
    raise ValidationError(
        {"url": ["Use an HTTPS or SSH clone URL, such as https://github.com/owner/repo.git."]}
    )


def clone_repository(url, destination):
    """Clone into staging, then move to a new destination only after Git succeeds."""
    validate_git_url(url)
    try:
        target = Path(destination).expanduser()
        if not target.is_absolute():
            raise ValidationError({"path": ["Enter an absolute destination path."]})
        parent = resolve_folder(str(target.parent))
        target = parent / target.name
        if target.exists() or target.is_symlink():
            raise ValidationError(
                {"path": ["Choose a new folder. The destination already exists."]}
            )
        # Never prompt for credentials in the service process or run globally configured hooks.
        env = {
            **os.environ,
            "GIT_TERMINAL_PROMPT": "0",
            "GCM_INTERACTIVE": "Never",
            "GIT_SSH_COMMAND": "ssh -o BatchMode=yes -o ConnectTimeout=15",
        }
        with tempfile.TemporaryDirectory(prefix=".torchbearer-clone-", dir=parent) as staging:
            checkout = Path(staging) / "checkout"
            subprocess.run(
                [
                    "git",
                    "-c",
                    "protocol.file.allow=never",
                    "-c",
                    "protocol.ext.allow=never",
                    "-c",
                    f"core.hooksPath={settings.DATA_DIR / 'disabled-hooks'}",
                    "clone",
                    "--",
                    url,
                    str(checkout),
                ],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                timeout=120,
                check=True,
                env=env,
            )
            # mkdir reserves the destination without replacing any existing path.
            target.mkdir()
            try:
                for child in checkout.iterdir():
                    shutil.move(str(child), str(target / child.name))
            except OSError:
                shutil.rmtree(target)
                raise
        return target.resolve()
    except subprocess.TimeoutExpired:
        raise ValidationError(
            {"url": ["Cloning timed out. Check the URL and connection, then retry."]}
        ) from None
    except subprocess.CalledProcessError:
        raise ValidationError(
            {"url": ["Could not clone. Check the URL and this machine's Git credentials."]}
        ) from None
    except FileNotFoundError:
        raise ValidationError(
            {"url": ["Git is unavailable. Install Git on the machine running Torchbearer."]}
        ) from None
    except OSError:
        raise ValidationError(
            {"path": ["Could not create the destination. Choose an accessible new folder."]}
        ) from None
