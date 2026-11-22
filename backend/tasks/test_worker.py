import json
from pathlib import Path

import pytest
from django.utils import timezone

from .models import AgentRun, ColumnAssignment, Task
from .worker import Worker, WorkerLock, worker_status
from .workflow import Conflict, act

pytestmark = pytest.mark.django_db


@pytest.fixture
def queued_task(repository, fake_cli, settings, tmp_path):
    settings.DATA_DIR = tmp_path / "data"
    for stage, agent in [("plan", "codex"), ("integrate", "claude"), ("test", "pi")]:
        fake_cli(agent, "implement")
        ColumnAssignment.objects.create(stage=stage, agent=agent)
    task = Task.objects.create(title="Implement a feature", repository=repository)
    act(task.id, action="start", revision=task.revision)
    return task


def approve(task, final=False):
    task.refresh_from_db()
    run = task.runs.first()
    return act(
        task.id,
        action="final_approve" if final else "approve",
        revision=task.revision,
        run_id=run.id,
        fingerprint=run.review_fingerprint,
    )


def test_mixed_agents_handoff_and_final_approval(queued_task):
    task = queued_task
    worker = Worker()
    for stage in ["plan", "integrate", "test"]:
        assert worker.run_once()
        task.refresh_from_db()
        run = task.runs.first()
        assert task.status == stage
        assert run.state == "succeeded", run.error
        assert run.cli_version
        assert run.log and run.review_fingerprint
        if stage != "plan":
            assert run.input_context["approved_plan"]["summary"].startswith("Plan")
        approve(task)
    task.refresh_from_db()
    assert task.status == "final_approval" and task.completed_at is None
    assert task.runs.count() == 3
    assert (Path(task.workspace_path) / "feature.txt").is_file()
    assert not (Path(task.repository.path) / "feature.txt").exists()
    approve(task, final=True)
    task.refresh_from_db()
    assert task.completed_at


def test_report_only_test_agent_cannot_succeed_after_edits(queued_task, fake_cli):
    worker = Worker()
    worker.run_once()
    approve(queued_task)
    # Leave Integrate's result unchanged so a new file in Test is observable.
    fake_cli("claude", "normal")
    worker.run_once()
    approve(queued_task)
    fake_cli("pi", "modify")
    worker.run_once()
    run = queued_task.runs.first()
    assert run.state == "blocked"
    assert "changed workspace files" in run.error
    assert not run.review_fingerprint


def test_changed_workspace_invalidates_review_and_queued_handoff(queued_task):
    worker = Worker()
    worker.run_once()
    queued_task.refresh_from_db()
    file = Path(queued_task.workspace_path) / "README.md"
    original = file.read_text(encoding="utf-8")
    file.write_text("External changes", encoding="utf-8")
    with pytest.raises(Conflict, match="stale"):
        approve(queued_task)
    file.write_text(original, encoding="utf-8")
    approve(queued_task)
    file.write_text("Changes after approval", encoding="utf-8")
    worker.run_once()
    assert queued_task.runs.first().state == "blocked"
    assert "changed while queued" in queued_task.runs.first().error


def test_worker_recovery_does_not_repeat_running_work(queued_task):
    worker = Worker()
    run = queued_task.runs.first()
    run.state = "running"
    run.started_at = timezone.now()
    run.save()
    with WorkerLock():
        worker.recover()
        assert worker_status()["available"]
        assert not worker.run_once()
    run.refresh_from_db()
    assert run.state == "interrupted"
    assert not run.task.workspace_path
    assert AgentRun.objects.count() == 1


def test_worker_lock_rejects_second_worker(settings, tmp_path):
    settings.DATA_DIR = tmp_path
    with WorkerLock(), pytest.raises(RuntimeError, match="Another agent worker"):
        with WorkerLock():
            pass


def test_cancelled_run_is_never_claimed(queued_task):
    from .workflow import cancel

    cancel(queued_task.id, queued_task.runs.first().id)
    assert not Worker().run_once()


def test_worker_shutdown_marks_active_run_interrupted(queued_task, monkeypatch):
    worker = Worker()
    worker.stop.set()
    assert worker.run_once()
    assert queued_task.runs.first().state == "interrupted"


def test_handoff_context_contains_human_rework_feedback(queued_task, fake_cli):
    worker = Worker()
    worker.run_once()
    approve(queued_task)
    worker.run_once()
    approve(queued_task)
    fake_cli("pi", "test_fail")
    worker.run_once()
    task = queued_task
    task.refresh_from_db()
    run = task.runs.first()
    assert run.state == "failed"
    assert task.status == "test"
    act(
        task.id,
        action="send_back",
        revision=task.revision,
        run_id=run.id,
        feedback="Fix validation.",
    )
    worker.run_once()
    run = task.runs.first()
    assert run.input_context["feedback"] == "Fix validation."
    assert "Fixture test report" in json.dumps(run.input_context["prior_runs"])
