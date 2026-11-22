from pathlib import Path

import pytest

from .git import git
from .models import Task
from .workspaces import changes, ensure_workspace, fingerprint

pytestmark = pytest.mark.django_db


def test_worktrees_are_isolated_and_start_from_committed_code(repository, settings, tmp_path):
    settings.DATA_DIR = tmp_path / "data"
    source = Path(repository.path)
    (source / "README.md").write_text("Uncommitted personal work", encoding="utf-8")
    first = Task.objects.create(title="First", repository=repository)
    second = Task.objects.create(title="Second", repository=repository)
    path = ensure_workspace(first)
    other = ensure_workspace(second)
    assert path != other
    assert ensure_workspace(first) == path
    assert (path / "README.md").read_text(encoding="utf-8") == "Example project\n"
    before = fingerprint(first)
    (path / "README.md").write_text("Task changes", encoding="utf-8")
    assert fingerprint(first) != before
    assert (source / "README.md").read_text(encoding="utf-8") == "Uncommitted personal work"
    assert (other / "README.md").read_text(encoding="utf-8") == "Example project\n"


def test_fingerprint_covers_index_untracked_files_and_changes(repository, settings, tmp_path):
    settings.DATA_DIR = tmp_path / "data"
    task = Task.objects.create(title="Snapshots", repository=repository)
    path = ensure_workspace(task)
    original = fingerprint(task)
    new = path / "new.txt"
    new.write_text("new content", encoding="utf-8")
    untracked = fingerprint(task)
    assert original != untracked
    assert "new content" in changes(task)["diff"]
    git(path, "add", "new.txt")
    assert fingerprint(task) != untracked
    new.write_text("changed again", encoding="utf-8")
    assert fingerprint(task) not in {untracked, original}


def test_workspace_cannot_be_redirected_outside_managed_directory(repository, settings, tmp_path):
    settings.DATA_DIR = tmp_path / "data"
    task = Task.objects.create(
        title="Bad path", repository=repository, workspace_path=repository.path
    )
    with pytest.raises(ValueError, match="path"):
        ensure_workspace(task)
