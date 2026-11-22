from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from django.urls import reverse
from projects.models import Project

from .conftest import csrf
from .models import ColumnAssignment, Repository, Task

pytestmark = pytest.mark.django_db


def test_selected_git_project_uses_existing_execution_repository(
    local_client, repository, fake_cli
):
    project = Project.objects.create(name="Saved project", path=repository.path)
    response = local_client.post(
        reverse("task-list"),
        {"title": "Plan the selected project", "project_id": str(project.id)},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 201
    saved = response.json()
    assert saved["repository"] == str(repository.id)
    assert saved["project"]["id"] == str(project.id)
    assert Repository.objects.count() == 1
    fake_cli()
    ColumnAssignment.objects.create(stage="plan", agent="codex")
    response = local_client.post(
        reverse("task-action", kwargs={"pk": saved["id"]}),
        {"action": "start", "revision": saved["revision"]},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "plan"
    assert response.json()["latest_run"]["state"] == "queued"


def test_selected_git_project_registers_execution_repository(local_client, repository):
    project = Project.objects.create(name="New saved project", path=repository.path)
    repository.delete()
    response = local_client.post(
        reverse("task-list"),
        {"title": "Use a new Git project", "project_id": str(project.id)},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 201
    assert Repository.objects.get(id=response.json()["repository"]).path == project.path


def test_ordinary_folder_project_remains_a_valid_backlog_task(local_client, tmp_path):
    project = Project.objects.create(name="Ordinary folder", path=str(tmp_path))
    response = local_client.post(
        reverse("task-list"),
        {"title": "Capture folder work", "project_id": str(project.id)},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 201
    assert response.json()["repository"] is None
    assert response.json()["project"]["id"] == str(project.id)


def test_mismatched_project_and_repository_are_rejected(local_client, repository, tmp_path):
    project = Project.objects.create(name="Different folder", path=str(tmp_path))
    response = local_client.post(
        reverse("task-list"),
        {
            "title": "Ambiguous source",
            "project_id": str(project.id),
            "repository": str(repository.id),
        },
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 400
    assert "repository" in response.json()
    assert Task.objects.count() == 0


def test_backlog_repository_change_keeps_project_context_consistent(
    local_client, repository, tmp_path
):
    old_project = Project.objects.create(name="Previous folder", path=str(tmp_path))
    selected_project = Project.objects.create(name="Git project", path=repository.path)
    task = Task.objects.create(title="Select an execution repository", project=old_project)
    response = local_client.patch(
        reverse("task-detail", kwargs={"pk": task.id}),
        {"repository": str(repository.id)},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 200
    assert response.json()["project"]["id"] == str(selected_project.id)
    assert response.json()["revision"] == 1


@pytest.mark.django_db(transaction=True)
def test_merge_migration_preserves_existing_repositories_tasks_and_project_names(tmp_path):
    repository = Repository.objects.create(name="Legacy repository", path=str(tmp_path / "legacy"))
    legacy_task = Task.objects.create(
        title="Existing started task", repository=repository, status="plan"
    )
    project = Project.objects.create(name="Keep this name", path=repository.path, archived=True)
    project_task = Task.objects.create(title="Existing project draft", project=project)
    migration = import_module("tasks.migrations.0006_merge_projects_and_workflow")
    with connection.schema_editor() as editor:
        migration.preserve_repository_selections(apps, editor)
    legacy_task.refresh_from_db()
    project_task.refresh_from_db()
    project.refresh_from_db()
    assert legacy_task.project_id == project.id
    assert legacy_task.status == "plan" and legacy_task.repository_id == repository.id
    assert project_task.project_id == project.id and project_task.repository_id == repository.id
    assert project.name == "Keep this name" and project.archived


@pytest.mark.django_db(transaction=True)
def test_merge_migration_adds_existing_repositories_to_saved_projects(tmp_path):
    repository = Repository.objects.create(name="r" * 255, path=str(tmp_path))
    task = Task.objects.create(title="Existing task", repository=repository)
    migration = import_module("tasks.migrations.0006_merge_projects_and_workflow")
    with connection.schema_editor() as editor:
        migration.preserve_repository_selections(apps, editor)
    project = Project.objects.get(path=repository.path)
    task.refresh_from_db()
    assert project.name == "r" * 200
    assert not project.archived
    assert task.project_id == project.id
