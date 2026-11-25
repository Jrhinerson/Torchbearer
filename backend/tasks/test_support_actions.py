from pathlib import Path

import pytest

from .conftest import csrf
from .models import Task
from .routing import SupportStage, agent_for
from .worker import Worker
from .workflow import Conflict, act, update_settings
from .workspaces import fingerprint

pytestmark = pytest.mark.django_db


@pytest.fixture
def task(repository, fake_cli, settings, tmp_path):
    settings.DATA_DIR = tmp_path / "data"
    fake_cli("codex", "normal")
    return Task.objects.create(title="Clarify a feature", repository=repository)


def action(task, name, feedback=""):
    task.refresh_from_db()
    run = task.runs.first()
    return act(
        task.pk,
        action=name,
        revision=task.revision,
        run_id=run.pk if run else None,
        fingerprint=run.review_fingerprint if run else "",
        feedback=feedback,
    )


def complete(task):
    action(task, "start")
    for _ in range(3):
        Worker().run_once()
        action(task, "approve")
    action(task, "final_approve")
    task.refresh_from_db()


def test_refinement_feedback_and_full_decisions_reach_plan(task, fake_cli):
    fake_cli("codex", "questions")
    action(task, "refine")
    Worker().run_once()
    task.refresh_from_db()
    assert task.status == "backlog"
    first = task.runs.first()
    assert first.stage == "refine" and first.state == "blocked"
    with pytest.raises(Conflict):
        action(task, "start")
    fake_cli("codex", "normal")
    action(task, "refine", "Display only; do not change task sorting.")
    Worker().run_once()
    refined = task.runs.first()
    assert refined.state == "succeeded"
    assert refined.input_context["artifacts"]["refinement"]["run_id"] == str(first.pk)
    assert "Display only" in refined.result["details"]
    action(task, "start")
    Worker().run_once()
    plan = task.runs.first()
    assert plan.stage == "plan" and plan.state == "succeeded"
    assert plan.input_context["artifacts"]["refinement"]["result"] == refined.result


def test_refinement_locks_repository_routing_and_deletion(task, local_client):
    action(task, "refine")
    with pytest.raises(Conflict, match="active run"):
        action(task, "refine")
    Worker().run_once()
    task.refresh_from_db()
    with pytest.raises(Conflict, match="locked"):
        update_settings(task.pk, revision=task.revision, repository=None)
    with pytest.raises(Conflict, match="locked"):
        update_settings(
            task.pk, revision=task.revision, routing_mode="local_only", frontier_agent=None
        )
    assert local_client.delete(f"/api/v1/tasks/{task.pk}/", **csrf(local_client)).status_code == 409


def test_stale_refinement_must_be_refreshed_before_planning(task):
    action(task, "refine")
    Worker().run_once()
    task.refresh_from_db()
    (Path(task.workspace_path) / "new-requirement.txt").write_text("Changed", encoding="utf-8")
    with pytest.raises(Conflict, match="stale"):
        action(task, "start")
    action(task, "refine", "Recheck the new requirement.")
    Worker().run_once()
    action(task, "start")
    task.refresh_from_db()
    assert task.status == "plan"


def test_retro_retains_acceptance_and_uses_accepted_evidence(task):
    complete(task)
    accepted_at = task.completed_at
    review = task.runs.first()
    snapshot = fingerprint(task)
    action(task, "retro")
    Worker().run_once()
    task.refresh_from_db()
    retro = task.runs.first()
    assert retro.stage == "retro" and retro.state == "succeeded", retro.error
    assert retro.input_context["artifacts"]["accepted_review"]["run_id"] == str(review.pk)
    assert len(retro.input_context["artifacts"]["session"]) == 3
    assert task.status == "final_approval" and task.completed_at == accepted_at
    assert fingerprint(task) == snapshot
    assert task.runs.count() == 4
    with pytest.raises(Conflict, match="already approved"):
        action(task, "send_back", "Change accepted code")


@pytest.mark.parametrize("stage", ["refine", "retro"])
def test_support_actions_cannot_succeed_after_workspace_edits(task, fake_cli, stage):
    if stage == "retro":
        complete(task)
    fake_cli("codex", "modify")
    action(task, stage)
    Worker().run_once()
    run = task.runs.first()
    assert run.state == "blocked" and not run.review_fingerprint
    assert "changed workspace files" in run.error


def test_retro_uses_historical_acceptance_after_later_workspace_changes(task):
    with pytest.raises(Conflict):
        action(task, "retro")
    complete(task)
    (Path(task.workspace_path) / "README.md").write_text("Later edit", encoding="utf-8")
    action(task, "retro")
    Worker().run_once()
    retro = task.runs.first()
    assert retro.state == "succeeded", retro.error
    assert retro.input_context["artifacts"]["accepted_review"]["fingerprint"] != (
        retro.review_fingerprint
    )


@pytest.mark.parametrize("stage", SupportStage.values)
def test_support_actions_follow_task_routing(task, stage):
    task.routing_mode, task.frontier_agent = "hybrid", "claude"
    assert agent_for(task, stage) == "claude"
    task.routing_mode, task.frontier_agent = "local_only", None
    assert agent_for(task, stage) == "pi"
