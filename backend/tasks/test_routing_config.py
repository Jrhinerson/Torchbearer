import pytest

from .conftest import csrf
from .models import ColumnAssignment, Repository, Task

pytestmark = pytest.mark.django_db


def test_assignments_are_persisted_and_human_columns_are_rejected(local_client):
    assert local_client.get("/api/v1/routing/").json()["assignments"] == {
        "plan": "",
        "integrate": "",
        "test": "",
    }
    assert (
        local_client.patch("/api/v1/routing/plan/", {"agent": "codex"}, format="json").status_code
        == 403
    )
    for stage in ["plan", "integrate", "test"]:
        response = local_client.patch(
            f"/api/v1/routing/{stage}/", {"agent": "pi"}, format="json", **csrf(local_client)
        )
        assert response.status_code == 200
    assert ColumnAssignment.objects.count() == 3
    assert local_client.get("/api/v1/routing/").json()["assignments"]["test"] == "pi"
    for stage, agent in [("backlog", "pi"), ("final_approval", "pi"), ("plan", "unknown")]:
        assert (
            local_client.patch(
                f"/api/v1/routing/{stage}/", {"agent": agent}, format="json", **csrf(local_client)
            ).status_code
            == 400
        )


def test_repository_registration_validates_git_and_deduplicates(local_client, repository, tmp_path):
    for _ in range(2):
        response = local_client.post(
            "/api/v1/repositories/", {"path": repository.path}, format="json", **csrf(local_client)
        )
        assert response.status_code == 201
        assert response.json()["id"] == str(repository.id)
    assert Repository.objects.count() == 1
    response = local_client.post(
        "/api/v1/repositories/", {"path": str(tmp_path)}, format="json", **csrf(local_client)
    )
    assert response.status_code == 400


def test_task_repository_can_be_selected_for_existing_backlog(local_client, repository):
    task = Task.objects.create(title="Existing task")
    response = local_client.patch(
        f"/api/v1/tasks/{task.id}/",
        {"repository": str(repository.id)},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.repository == repository
