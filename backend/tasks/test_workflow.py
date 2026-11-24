import pytest
from django.db import IntegrityError, transaction

from .conftest import csrf
from .models import AgentRun, Decision, Task
from .workflow import Conflict, act, cancel
from .workspaces import ensure_workspace, fingerprint

pytestmark = pytest.mark.django_db


@pytest.fixture
def task(repository, monkeypatch, settings, tmp_path):
    settings.DATA_DIR = tmp_path / "data"
    monkeypatch.setattr("tasks.workflow.resolve_command", lambda agent: ["test-agent"])
    return Task.objects.create(title="Implement a feature", repository=repository)


def succeed(task):
    task.refresh_from_db()
    ensure_workspace(task)
    run = task.runs.first()
    run.state = "succeeded"
    run.result = {"outcome": "complete", "summary": "Done"}
    run.review_fingerprint = fingerprint(task)
    run.save()
    return run


def approve(task, run):
    task.refresh_from_db()
    return act(
        task.id,
        action="approve",
        revision=task.revision,
        run_id=run.id,
        fingerprint=run.review_fingerprint,
    )


def test_each_step_waits_for_human_approval_and_snapshots_agent(task):
    act(task.id, action="start", revision=0)
    run = task.runs.first()
    assert run.stage == "plan" and run.state == "queued"
    Task.objects.create(title="Independent task", routing_mode="local_only", frontier_agent=None)
    assert task.runs.first().agent == "codex"
    with pytest.raises(Conflict):
        approve(task, run)
    for stage, next_stage in [
        ("plan", "integrate"),
        ("integrate", "test"),
        ("test", "code_review"),
        ("code_review", "final_approval"),
    ]:
        run = succeed(task)
        task.refresh_from_db()
        assert task.status == stage
        approve(task, run)
        task.refresh_from_db()
        assert task.status == next_stage
    assert task.runs.count() == 4
    act(
        task.id,
        action="final_approve",
        revision=task.revision,
        run_id=run.id,
        fingerprint=run.review_fingerprint,
    )
    task.refresh_from_db()
    assert task.completed_at is not None
    assert Decision.objects.filter(task=task).count() == 6


def test_duplicate_actions_and_stale_results_cannot_start_another_run(task):
    act(task.id, action="start", revision=0)
    with pytest.raises(Conflict):
        act(task.id, action="start", revision=0)
    run = succeed(task)
    task.refresh_from_db()
    with pytest.raises(Conflict):
        act(task.id, action="approve", revision=task.revision, run_id=run.id, fingerprint="wrong")
    assert task.runs.count() == 1
    assert Decision.objects.count() == 1


def test_planning_messages_require_latest_inactive_plan_and_nonempty_text(task, local_client):
    act(task.id, action="start", revision=0)
    task.refresh_from_db()
    run = task.runs.first()
    with pytest.raises(Conflict, match="active run"):
        act(task.id, action="plan_message", revision=task.revision, run_id=run.id, feedback="Hi")
    run = succeed(task)
    task.refresh_from_db()
    url = f"/api/v1/tasks/{task.id}/actions/"
    payload = {"action": "plan_message", "revision": task.revision, "run_id": str(run.id)}
    assert local_client.post(url, {**payload, "feedback": "Hi"}, format="json").status_code == 403
    headers = csrf(local_client)
    for text in ["", "   ", "x" * 4001]:
        response = local_client.post(url, {**payload, "feedback": text}, format="json", **headers)
        assert response.status_code in {400, 409}
    task.refresh_from_db()
    assert task.revision == payload["revision"] and task.runs.count() == 1
    response = local_client.post(
        url, {**payload, "feedback": "  Keep existing files.  "}, format="json", **headers
    )
    assert response.status_code == 200
    assert response.data["status"] == "plan"
    reply = task.runs.first()
    assert reply.feedback == "Keep existing files." and reply.agent == run.agent
    assert reply.stage == "plan" and reply.state == "queued"
    # A duplicate submission cannot consume another revision or queue another reply.
    assert (
        local_client.post(url, {**payload, "feedback": "Hi"}, format="json", **headers).status_code
        == 409
    )
    succeed(task)
    task.refresh_from_db()
    with pytest.raises(Conflict, match="latest run"):
        act(task.id, action="plan_message", revision=task.revision, run_id=run.id, feedback="Hi")
    approve(task, task.runs.first())
    run = succeed(task)
    task.refresh_from_db()
    with pytest.raises(Conflict, match="only be sent in Plan"):
        act(task.id, action="plan_message", revision=task.revision, run_id=run.id, feedback="Hi")


def test_missing_repository_or_agent_keeps_task_in_previous_column(task):
    task.repository = None
    task.save()
    with pytest.raises(Conflict, match="repository"):
        act(task.id, action="start", revision=0)
    assert not task.runs.exists()


def test_missing_next_agent_does_not_consume_approval(task, monkeypatch):
    act(task.id, action="start", revision=0)
    run = succeed(task)
    monkeypatch.setattr("tasks.workflow.resolve_command", lambda agent: None)
    with pytest.raises(Conflict, match="not installed"):
        approve(task, run)
    task.refresh_from_db()
    assert task.status == "plan"
    assert task.runs.count() == 1


def test_failed_test_is_sent_back_only_by_a_human_action(task):
    act(task.id, action="start", revision=0)
    approve(task, succeed(task))
    approve(task, succeed(task))
    run = task.runs.first()
    run.state = "failed"
    run.save()
    task.refresh_from_db()
    assert task.status == "test"
    act(
        task.id,
        action="send_back",
        revision=task.revision,
        run_id=run.id,
        feedback="Fix the failing test.",
    )
    task.refresh_from_db()
    assert task.status == "integrate"
    assert task.runs.first().feedback == "Fix the failing test."


def test_cancel_queued_run_and_retry(task):
    act(task.id, action="start", revision=0)
    run = task.runs.first()
    cancel(task.id, run.id)
    task.refresh_from_db()
    assert task.runs.first().state == "cancelled"
    act(task.id, action="retry", revision=task.revision, run_id=run.id)
    assert task.runs.count() == 2
    with transaction.atomic(), pytest.raises(IntegrityError):
        AgentRun.objects.create(task=task, sequence=3, stage="plan", agent="pi")


def test_actions_are_csrf_protected_and_started_tasks_cannot_be_deleted(task, local_client):
    url = f"/api/v1/tasks/{task.id}/actions/"
    assert (
        local_client.post(url, {"action": "start", "revision": 0}, format="json").status_code == 403
    )
    assert (
        local_client.post(
            url, {"action": "start", "revision": 0}, format="json", **csrf(local_client)
        ).status_code
        == 200
    )
    assert local_client.delete(f"/api/v1/tasks/{task.id}/", **csrf(local_client)).status_code == 409
