import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AgentRun, Decision, Task, WorkerStatus

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("stage", "state", "completed", "group", "reason"),
    [
        ("backlog", None, False, "backlog", "Ready"),
        ("backlog", "queued", False, "active", "Queued"),
        ("backlog", "succeeded", False, "needs_you", "Review refinement"),
        ("plan", "blocked", False, "needs_you", "Answer or resolve blocker"),
        ("plan", "succeeded", False, "needs_you", "Approve plan"),
        ("integrate", "succeeded", False, "needs_you", "Approve validation"),
        ("code_review", "failed", False, "needs_you", "Review failure"),
        ("integrate", "cancelled", False, "needs_you", "Retry or revise"),
        ("integrate", "interrupted", False, "needs_you", "Review interrupted work"),
        ("final_approval", "succeeded", False, "needs_you", "Give final approval"),
        ("final_approval", "running", True, "done", "Approved"),
    ],
)
def test_board_grouping(stage, state, completed, group, reason):
    task = Task.objects.create(
        title="Example", status=stage, completed_at=timezone.now() if completed else None
    )
    if state:
        AgentRun.objects.create(
            task=task,
            stage="refine" if stage == "backlog" else stage,
            state=state,
            agent="codex",
            sequence=1,
        )
    response = APIClient().get("/api/v1/operations/")
    assert response.status_code == 200
    data = response.json()
    assert data["counts"][group] == 1
    assert data["tasks"][0]["operations"]["group"] == group
    assert data["tasks"][0]["operations"]["reason"].startswith(reason)


def test_counts_filters_and_query_count(django_assert_num_queries):
    for index in range(12):
        task = Task.objects.create(title=f"Task {index}")
        AgentRun.objects.create(task=task, stage="plan", agent="pi", state="failed", sequence=1)
    client = APIClient()
    with django_assert_num_queries(5):
        data = client.get("/api/v1/operations/?q=Task%201&project=none").json()
    assert len(data["tasks"]) == 3
    assert data["counts"]["needs_you"] == 3
    assert data["filters"] == {"q": "Task 1", "project": "none"}
    assert client.get("/api/v1/operations/?project=invalid").status_code == 400


def test_only_recorded_worker_run_is_running():
    task = Task.objects.create(title="Running", status="plan")
    run = AgentRun.objects.create(
        task=task, stage="plan", agent="codex", state="running", sequence=1
    )
    client = APIClient()
    assert not client.get("/api/v1/operations/").json()["tasks"][0]["operations"]["running"]
    WorkerStatus.objects.create(
        id=1, worker_id=uuid.uuid4(), heartbeat=timezone.now(), active_run=run
    )
    data = client.get("/api/v1/operations/").json()
    assert data["tasks"][0]["operations"]["running"]
    assert next(agent for agent in data["agents"] if agent["id"] == "codex")["running"] == 1


def test_handoff_identifies_receiving_agent_instead_of_previous_author():
    task = Task.objects.create(title="Hand off to Pi", status="integrate", routing_mode="hybrid")
    AgentRun.objects.create(task=task, stage="plan", agent="codex", state="succeeded", sequence=1)
    data = APIClient().get("/api/v1/operations/").json()
    assert data["tasks"][0]["operations"]["agent"] == "pi"


def test_flow_does_not_reuse_old_review_after_revision():
    task = Task.objects.create(title="Rework", status="integrate", routing_mode="hybrid")
    for sequence, stage in [(1, "plan"), (2, "integrate"), (3, "code_review"), (4, "integrate")]:
        run = AgentRun.objects.create(
            task=task,
            sequence=sequence,
            stage=stage,
            agent="codex",
            state="succeeded" if sequence < 4 else "failed",
        )
        if sequence < 3:
            Decision.objects.create(
                task=task,
                run=run,
                action="approve",
                from_stage=stage,
                to_stage="integrate",
                task_revision=sequence,
            )
    data = APIClient().get(f"/api/v1/tasks/{task.id}/flow/").json()
    assert data["revision"] == task.revision
    assert next(node for node in data["nodes"] if node["id"] == "integrate")["state"] == "failed"
    assert next(node for node in data["nodes"] if node["id"] == "code_review")["state"] == "planned"
    assert len(data["runs"]) == 4
    assert "retry" in [action["action"] for action in data["actions"]]


def test_missing_routing_needs_attention_and_history_404():
    Task.objects.create(title="Choose routing", routing_mode=None, frontier_agent=None)
    client = APIClient()
    assert client.get("/api/v1/operations/").json()["counts"]["needs_you"] == 1
    assert client.get(f"/api/v1/tasks/{uuid.uuid4()}/flow/").status_code == 404
