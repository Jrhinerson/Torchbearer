"""Task worktrees are retained; no cleanup operation discards a developer's work."""

import hashlib
import os
from pathlib import Path

from django.conf import settings

from .git import git, git_bytes, repository_path


def workspace_root():
    return (settings.DATA_DIR / "workspaces").resolve()


def checked_workspace(task):
    expected = workspace_root() / str(task.id)
    path = Path(task.workspace_path).resolve()
    if not task.workspace_path or path != expected or not path.is_relative_to(workspace_root()):
        raise ValueError(
            "The task workspace is missing or outside Torchbearer's workspace directory."
        )
    if Path(git(path, "rev-parse", "--show-toplevel")).resolve() != path:
        raise ValueError("The task workspace is no longer a Git worktree.")
    common = Path(git(path, "rev-parse", "--path-format=absolute", "--git-common-dir")).resolve()
    source = Path(
        git(task.repository.path, "rev-parse", "--path-format=absolute", "--git-common-dir")
    ).resolve()
    if common != source or git(path, "symbolic-ref", "--short", "HEAD") != task.branch:
        raise ValueError("The task workspace repository or branch has changed.")
    return path


def ensure_workspace(task):
    repository_path(task.repository.path)
    root = workspace_root()
    root.mkdir(parents=True, exist_ok=True)
    path = root / str(task.id)
    if not task.workspace_path:
        task.workspace_path = str(path)
        task.branch = f"torchbearer/{task.id.hex}"
        task.base_commit = git(task.repository.path, "rev-parse", "HEAD")
        task.save(update_fields=["workspace_path", "branch", "base_commit"])
    if Path(task.workspace_path).resolve() != path:
        raise ValueError("The saved workspace path does not match this task.")
    if not path.exists():
        try:
            existing = git(
                task.repository.path, "rev-parse", "--verify", f"refs/heads/{task.branch}"
            )
        except ValueError:
            existing = None
        if existing:
            if existing != task.base_commit:
                raise ValueError(
                    "The task branch already has work. Restore its worktree before retrying."
                )
            git(task.repository.path, "worktree", "add", str(path), task.branch)
        else:
            git(
                task.repository.path,
                "worktree",
                "add",
                "--no-track",
                "-b",
                task.branch,
                str(path),
                task.base_commit,
            )
    return checked_workspace(task)


def _files(path):
    records = git_bytes(path, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    return sorted(set(record for record in records.split(b"\0") if record))


def fingerprint(task):
    path = checked_workspace(task)
    digest = hashlib.sha256()
    digest.update(git_bytes(path, "rev-parse", "HEAD"))
    digest.update(
        git_bytes(
            path, "diff", "--no-ext-diff", "--no-textconv", "--cached", "--binary", "HEAD", "--"
        )
    )
    for name in _files(path):
        digest.update(b"\0path\0" + name + b"\0")
        file = path / os.fsdecode(name)
        if file.is_symlink():
            digest.update(b"link\0" + os.fsencode(os.readlink(file)))
        elif file.is_file():
            digest.update(b"file\0" + str(file.stat().st_mode).encode() + b"\0")
            with file.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
        elif file.is_dir():
            # Gitlinks and nested repositories are not safe to review as a single file.
            raise ValueError(
                "Submodules and nested repositories in task worktrees are not supported yet."
            )
        else:
            digest.update(b"deleted\0")
    return digest.hexdigest()


def changes(task):
    path = checked_workspace(task)
    limit = 64000
    diff = git(path, "diff", "--no-ext-diff", "--no-textconv", task.base_commit, "--")
    for name in git_bytes(path, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0"):
        if not name:
            continue
        file = path / os.fsdecode(name)
        diff += f"\nNew file: {os.fsdecode(name)}\n"
        if file.is_file() and not file.is_symlink():
            with file.open("rb") as stream:
                diff += stream.read(limit).decode("utf-8", errors="replace")
        if len(diff) > limit:
            break
    return {"diff": diff[:limit], "truncated": len(diff) > limit, "fingerprint": fingerprint(task)}
