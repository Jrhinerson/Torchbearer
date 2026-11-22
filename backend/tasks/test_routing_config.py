import pytest
from django.db import IntegrityError, transaction

from .conftest import csrf
from .models import AgentRun, Repository, Task

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("mode", "agent"),
    [(None, "codex"), ("frontier", None), ("local_only", "claude"), ("bad", None)],
)
def test_database_rejects_inconsistent_routing(mode, agent):
    with transaction.atomic(), pytest.raises(IntegrityError):
        Task.objects.create(
            title="Invalid database policy", routing_mode=mode, frontier_agent=agent
        )


def test_legacy_task_cannot_progress_before_routing_choice(repository):
    from .workflow import Conflict, act

    task = Task.objects.create(
        title="Legacy backlog", repository=repository, routing_mode=None, frontier_agent=None
    )
    with pytest.raises(Conflict, match="Choose a routing approach"):
        act(task.id, action="start", revision=0)
    task.refresh_from_db()
    assert task.revision == 0
    assert not task.runs.exists()


def test_started_task_cannot_change_repository_even_after_run_finishes(local_client, repository):
    task = Task.objects.create(title="Started", repository=repository, status="plan")
    response = local_client.patch(
        f"/api/v1/tasks/{task.id}/",
        {"revision": 0, "repository": None},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 409
    task.refresh_from_db()
    assert task.repository == repository and task.revision == 0


def test_catalog_classifies_agents_without_global_assignments(local_client):
    response = local_client.get("/api/v1/routing/").json()
    assert "assignments" not in response
    assert {agent["id"]: agent["kind"] for agent in response["agents"]} == {
        "codex": "frontier",
        "claude": "frontier",
        "pi": "local",
    }
    assert (
        local_client.patch(
            "/api/v1/routing/plan/", {"agent": "codex"}, format="json", **csrf(local_client)
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    ("mode", "agent"),
    [("frontier", "codex"), ("frontier", "claude"), ("hybrid", "claude"), ("local_only", None)],
)
def test_create_task_policy(local_client, mode, agent):
    response = local_client.post(
        "/api/v1/tasks/",
        {"title": "Policy task", "routing_mode": mode, "frontier_agent": agent},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["routing_mode"] == mode
    assert data["frontier_agent"] == agent
    assert data["stage_agents"]["integrate"] == ("pi" if mode != "frontier" else agent)
    assert not AgentRun.objects.exists()


@pytest.mark.parametrize(
    ("mode", "agent"),
    [
        (None, None),
        ("unknown", "codex"),
        ("frontier", None),
        ("hybrid", "pi"),
        ("local_only", "codex"),
    ],
)
def test_invalid_task_policy_is_rejected(local_client, mode, agent):
    response = local_client.post(
        "/api/v1/tasks/",
        {"title": "Invalid policy", "routing_mode": mode, "frontier_agent": agent},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 400
    assert not Task.objects.exists()


def test_default_policy_and_local_mode_without_frontier(local_client):
    for payload, mode, agent in [
        ({}, "frontier", "codex"),
        ({"routing_mode": "local_only"}, "local_only", None),
    ]:
        response = local_client.post(
            "/api/v1/tasks/", {"title": "Defaults", **payload}, format="json", **csrf(local_client)
        )
        assert response.status_code == 201, response.json()
        assert response.json()["routing_mode"] == mode
        assert response.json()["frontier_agent"] == agent


def test_routing_edits_are_revision_checked_and_locked_after_start(
    local_client, repository, fake_cli
):
    fake_cli("pi")
    task = Task.objects.create(title="Editable", repository=repository)
    url = f"/api/v1/tasks/{task.id}/"
    response = local_client.patch(
        url, {"revision": 0, "routing_mode": "local_only"}, format="json", **csrf(local_client)
    )
    assert response.status_code == 200
    assert response.json()["frontier_agent"] is None
    assert (
        local_client.patch(
            url, {"revision": 0, "routing_mode": "frontier"}, format="json", **csrf(local_client)
        ).status_code
        == 409
    )
    from .workflow import act

    act(task.id, action="start", revision=1)
    task.refresh_from_db()
    assert task.runs.first().agent == "pi"
    response = local_client.patch(
        url,
        {"revision": task.revision, "routing_mode": "frontier"},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 409
    task.refresh_from_db()
    assert task.routing_mode == "local_only"
    assert task.runs.first().agent == "pi"


def test_legacy_choice_waits_for_active_work_and_is_only_allowed_once(local_client):
    task = Task.objects.create(
        title="Legacy", status="plan", routing_mode=None, frontier_agent=None
    )
    run = AgentRun.objects.create(task=task, stage="plan", agent="claude", sequence=1)
    url = f"/api/v1/tasks/{task.id}/"
    payload = {"revision": 0, "routing_mode": "hybrid", "frontier_agent": "codex"}
    assert local_client.patch(url, payload, format="json", **csrf(local_client)).status_code == 409
    run.state = "interrupted"
    run.save()
    response = local_client.patch(url, payload, format="json", **csrf(local_client))
    assert response.status_code == 200
    run.refresh_from_db()
    assert run.agent == "claude"
    payload["revision"] = response.json()["revision"]
    assert local_client.patch(url, payload, format="json", **csrf(local_client)).status_code == 409


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
        {"repository": str(repository.id), "revision": task.revision},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.repository == repository
