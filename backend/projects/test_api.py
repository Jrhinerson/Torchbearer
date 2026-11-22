import subprocess
import uuid
from pathlib import Path

import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from tasks.models import Task

from .models import Project


@pytest.fixture
def client():
    return APIClient(enforce_csrf_checks=True)


def write(client, method, url, data=None):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    return getattr(client, method)(url, data, format="json", HTTP_X_CSRFTOKEN=token)


@pytest.mark.django_db
def test_register_rename_remove_and_restore_project(client, tmp_path):
    response = write(client, "post", reverse("project-list"), {"path": str(tmp_path)})
    assert response.status_code == 201
    saved = response.json()
    assert saved["name"] == tmp_path.name
    assert saved["path"] == str(tmp_path.resolve())
    detail = reverse("project-detail", kwargs={"pk": saved["id"]})
    response = write(client, "patch", detail, {"name": "Renamed project"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed project"

    response = write(
        client,
        "post",
        reverse("task-list"),
        {
            "title": "Work on a project",
            "project_id": saved["id"],
        },
    )
    assert response.status_code == 201
    task_id = response.json()["id"]
    assert response.json()["project"]["name"] == "Renamed project"
    assert write(client, "delete", detail).status_code == 204
    assert client.get(reverse("project-list")).json() == []
    assert tmp_path.is_dir()
    task = client.get(reverse("task-list")).json()[0]
    assert task["id"] == task_id
    assert task["project"]["name"] == "Renamed project"
    assert task["project"]["archived"] is True
    assert Task.objects.get(id=task_id).project_id == uuid.UUID(saved["id"])
    response = write(
        client,
        "post",
        reverse("task-list"),
        {
            "title": "Use removed project",
            "project_id": saved["id"],
        },
    )
    assert response.status_code == 400
    response = write(
        client,
        "post",
        reverse("project-list"),
        {
            "path": str(tmp_path),
            "name": "Restored project",
        },
    )
    assert response.status_code == 201
    assert response.json()["id"] == saved["id"]
    assert response.json()["archived"] is False
    assert client.get(reverse("task-list")).json()[0]["project"]["name"] == "Restored project"


@pytest.mark.django_db
def test_duplicate_canonical_folder_is_rejected(client, tmp_path):
    folder = tmp_path / "project"
    folder.mkdir()
    assert write(client, "post", reverse("project-list"), {"path": str(folder)}).status_code == 201
    alias = str(folder / ".." / "project")
    response = write(client, "post", reverse("project-list"), {"path": alias})
    assert response.status_code == 400
    assert "already" in response.json()["path"][0]
    assert Project.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["relative/path", "/missing-torchbearer-project", "\x00"])
def test_invalid_folder_is_rejected(client, path):
    response = write(client, "post", reverse("project-list"), {"path": path})
    assert response.status_code == 400
    assert Project.objects.count() == 0


@pytest.mark.django_db
def test_a_file_cannot_be_registered(client, tmp_path):
    file = tmp_path / "file.txt"
    file.write_text("Keep this file.")
    response = write(client, "post", reverse("project-list"), {"path": str(file)})
    assert response.status_code == 400
    assert file.read_text() == "Keep this file."


def test_browse_lists_only_visible_directories_and_parent(client, tmp_path):
    (tmp_path / "zeta").mkdir()
    (tmp_path / "Alpha").mkdir()
    (tmp_path / ".git").mkdir()
    (tmp_path / "notes.txt").write_text("Not a folder")
    response = write(client, "post", reverse("project-folders"), {"path": str(tmp_path)})
    assert response.status_code == 200
    listing = response.json()
    assert listing["path"] == str(tmp_path.resolve())
    assert listing["parent"] == str(tmp_path.parent.resolve())
    assert [folder["name"] for folder in listing["folders"]] == ["Alpha", "zeta"]


def test_browse_defaults_to_home(client, tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    response = write(client, "post", reverse("project-folders"), {})
    assert response.status_code == 200
    assert response.json()["path"] == str(tmp_path)


def test_browse_marks_repositories_and_worktrees_before_other_folders(client, tmp_path):
    for name in ["a-folder", "b-worktree", "Z-repository"]:
        (tmp_path / name).mkdir()
    (tmp_path / "Z-repository" / ".git").mkdir()
    (tmp_path / "b-worktree" / ".git").write_text("gitdir: /some/repository/worktrees/test")
    (tmp_path / ".git").mkdir()
    listing = write(client, "post", reverse("project-folders"), {"path": str(tmp_path)}).json()
    assert listing["is_repository"] is True
    assert [(entry["name"], entry["is_repository"]) for entry in listing["folders"]] == [
        ("b-worktree", True),
        ("Z-repository", True),
        ("a-folder", False),
    ]


def test_browse_provides_breadcrumbs_and_existing_locations(client, tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / "Desktop").mkdir()
    nested = tmp_path / "Desktop" / "project"
    nested.mkdir()
    listing = write(client, "post", reverse("project-folders"), {"path": str(nested)}).json()
    assert listing["breadcrumbs"][0]["path"] == nested.anchor
    assert listing["breadcrumbs"][-2:] == [
        {"name": "Desktop", "path": str(nested.parent)},
        {"name": "project", "path": str(nested)},
    ]
    assert listing["locations"][:2] == [
        {"name": "Home", "path": str(tmp_path)},
        {"name": "Desktop", "path": str(tmp_path / "Desktop")},
    ]
    assert not any(item["name"] == "Downloads" for item in listing["locations"])


def test_browse_skips_unreadable_entries(client, tmp_path, monkeypatch):
    blocked = tmp_path / "blocked"
    blocked.mkdir()
    (tmp_path / "available").mkdir()
    original = Path.is_dir

    def is_dir(path):
        if path == blocked:
            raise PermissionError("Access denied")
        return original(path)

    monkeypatch.setattr(Path, "is_dir", is_dir)
    response = write(client, "post", reverse("project-folders"), {"path": str(tmp_path)})
    assert response.status_code == 200
    assert [entry["name"] for entry in response.json()["folders"]] == ["available"]


def test_browse_unreadable_directory_returns_validation_error(client, tmp_path, monkeypatch):
    original = Path.iterdir

    def iterdir(path):
        if path == tmp_path:
            raise PermissionError("Access denied")
        return original(path)

    monkeypatch.setattr(Path, "iterdir", iterdir)
    response = write(client, "post", reverse("project-folders"), {"path": str(tmp_path)})
    assert response.status_code == 400
    assert "cannot be read" in response.json()["path"][0]


@pytest.mark.parametrize("path", ["missing", None, [], {}])
def test_browse_bad_input_returns_validation_error(client, path):
    response = write(client, "post", reverse("project-folders"), {"path": path})
    assert response.status_code == 400


@pytest.mark.django_db
@pytest.mark.parametrize("operation", ["add", "rename", "remove", "browse"])
@pytest.mark.parametrize("verification", ["missing", "wrong-token", "untrusted-origin"])
def test_project_operations_require_csrf(client, tmp_path, operation, verification):
    project = Project.objects.create(name="Keep project", path=str(tmp_path))
    detail = reverse("project-detail", kwargs={"pk": project.id})
    method, url, data = {
        "add": ("post", reverse("project-list"), {"path": str(tmp_path / "other")}),
        "rename": ("patch", detail, {"name": "Unverified name"}),
        "remove": ("delete", detail, None),
        "browse": ("post", reverse("project-folders"), {"path": str(tmp_path)}),
    }[operation]
    headers = {}
    if verification != "missing":
        token = client.get(reverse("csrf-token")).json()["csrfToken"]
        headers["HTTP_X_CSRFTOKEN"] = "a" * 64 if verification == "wrong-token" else token
    if verification == "untrusted-origin":
        headers["HTTP_ORIGIN"] = "https://untrusted.example"
    response = getattr(client, method)(url, data, format="json", **headers)
    assert response.status_code == 403
    project.refresh_from_db()
    assert project.name == "Keep project" and not project.archived
    assert Project.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize("name", ["", "  ", "x" * 201])
def test_invalid_project_name_cannot_be_saved(client, tmp_path, name):
    response = write(client, "post", reverse("project-list"), {"path": str(tmp_path), "name": name})
    assert response.status_code == 400
    assert Project.objects.count() == 0


@pytest.mark.django_db
def test_unknown_or_invalid_project_cannot_be_assigned(client):
    for project_id in [str(uuid.uuid4()), "invalid"]:
        response = write(
            client,
            "post",
            reverse("task-list"),
            {
                "title": "Invalid project",
                "project_id": project_id,
            },
        )
        assert response.status_code == 400
        assert "project_id" in response.json()
    assert Task.objects.count() == 0


@pytest.mark.django_db
def test_existing_tasks_and_optional_project_remain_supported(client):
    Task.objects.create(title="Existing task")
    assert client.get(reverse("task-list")).json()[0]["project"] is None
    response = write(
        client, "post", reverse("task-list"), {"title": "No project", "project_id": None}
    )
    assert response.status_code == 201
    assert response.json()["project"] is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "url",
    [
        "file:///tmp/repo",
        "../repo",
        "--help",
        "ext::sh -c echo",
        "http://example.com/repo",
        "https://user:secret@example.com/repo",
        "https://example.com",
        "ssh://host/repo\n--help",
    ],
)
def test_clone_rejects_invalid_sources_before_running_git(client, tmp_path, monkeypatch, url):
    def unexpected(*args, **kwargs):
        pytest.fail("Git must not run for an invalid source")

    monkeypatch.setattr("projects.services.subprocess.run", unexpected)
    response = write(
        client,
        "post",
        reverse("project-list"),
        {
            "source": "clone",
            "url": url,
            "path": str(tmp_path / "clone"),
        },
    )
    assert response.status_code == 400
    assert not (tmp_path / "clone").exists()
    assert Project.objects.count() == 0


@pytest.mark.django_db
def test_clone_never_overwrites_destination(client, tmp_path, monkeypatch):
    (tmp_path / "keep.txt").write_text("Keep me")

    def unexpected(*args, **kwargs):
        pytest.fail("Git must not run when the destination exists")

    monkeypatch.setattr("projects.services.subprocess.run", unexpected)
    response = write(
        client,
        "post",
        reverse("project-list"),
        {
            "source": "clone",
            "url": "https://example.com/repo.git",
            "path": str(tmp_path),
        },
    )
    assert response.status_code == 400
    assert (tmp_path / "keep.txt").read_text() == "Keep me"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/owner/repo.git",
        "git@github.com:owner/repo.git",
        "ssh://git@example.com/owner/repo.git",
    ],
)
def test_clone_registers_checkout_after_git_success(client, tmp_path, monkeypatch, url):
    destination = tmp_path / "checkout"

    def clone(command, **kwargs):
        assert command[-3:-1] == ["--", url]
        assert kwargs["env"]["GIT_TERMINAL_PROMPT"] == "0"
        assert kwargs["timeout"] == 120 and kwargs["check"]
        checkout = Path(command[-1])
        checkout.mkdir()
        (checkout / ".git").mkdir()
        (checkout / "README.md").write_text("Cloned files")

    monkeypatch.setattr("projects.services.subprocess.run", clone)
    response = write(
        client,
        "post",
        reverse("project-list"),
        {
            "source": "clone",
            "url": url,
            "path": str(destination),
            "name": "My clone",
        },
    )
    assert response.status_code == 201
    assert response.json()["name"] == "My clone"
    assert response.json()["path"] == str(destination)
    assert (destination / "README.md").read_text() == "Cloned files"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["checkout"]


@pytest.mark.django_db
@pytest.mark.parametrize("failure", ["git", "timeout", "missing"])
def test_failed_clone_cleans_partial_files_and_can_retry(client, tmp_path, monkeypatch, failure):
    def clone(command, **kwargs):
        checkout = Path(command[-1])
        checkout.mkdir()
        (checkout / "partial").write_text("Incomplete")
        if failure == "timeout":
            raise subprocess.TimeoutExpired(command, 120)
        if failure == "missing":
            raise FileNotFoundError
        raise subprocess.CalledProcessError(128, command, stderr=b"private credentials")

    monkeypatch.setattr("projects.services.subprocess.run", clone)
    response = write(
        client,
        "post",
        reverse("project-list"),
        {
            "source": "clone",
            "url": "https://example.com/repo.git",
            "path": str(tmp_path / "clone"),
        },
    )
    assert response.status_code == 400
    assert "private credentials" not in str(response.json())
    assert list(tmp_path.iterdir()) == []
    assert Project.objects.count() == 0
