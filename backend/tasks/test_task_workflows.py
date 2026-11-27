from copy import deepcopy
from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from rest_framework.exceptions import ValidationError
from workflows.models import WorkflowDefinition, WorkType
from workflows.profiles import LEGACY_SNAPSHOT, snapshot_for

from .adapters import RunnerFailure, arguments, validate_result
from .conftest import csrf
from .models import AgentRun, Task
from .worker import Worker
from .workflow import Conflict, act, update_settings

pytestmark = pytest.mark.django_db


@pytest.fixture
def profiles(monkeypatch):
    for name, function in [
        ("0002_seed_catalogue", "seed_catalogue"),
        ("0003_consolidate_workflows", "consolidate_catalogue"),
        ("0004_workflowdefinition_definition_version_and_more", "seed_profiles"),
    ]:
        getattr(import_module(f"workflows.migrations.{name}"), function)(
            apps, connection.schema_editor()
        )
    monkeypatch.setattr("workflows.profiles.SUPPORTED_MODES", {"code_change", "decision"})


def test_snapshots_keep_assignment_and_procedures_when_defaults_change(profiles):
    work_type = WorkType.objects.get(pk="bug")
    task = Task.objects.create(
        title="Regression", work_type=work_type, workflow_snapshot=snapshot_for(work_type)
    )
    WorkType.objects.filter(pk="bug").update(assigned_workflow_id="test-driven")
    task.refresh_from_db()
    assert task.workflow_snapshot["key"] == "diagnose-regression"
    assert task.workflow_snapshot["steps"][1]["id"] == "reproduce"
    updated = update_settings(task.id, revision=0, refresh_workflow=True)
    assert updated.workflow_snapshot["key"] == "test-driven"


def test_workflow_locks_at_refinement_and_stale_settings_rollback(profiles):
    task = Task.objects.create(title="Refined", workflow_snapshot=deepcopy(LEGACY_SNAPSHOT))
    AgentRun.objects.create(task=task, stage="refine", sequence=1, agent="codex", state="succeeded")
    with pytest.raises(Conflict, match="locked"):
        update_settings(task.id, revision=0, work_type=WorkType.objects.get(pk="feature"))
    task.refresh_from_db()
    assert task.revision == 0 and task.workflow_snapshot == LEGACY_SNAPSHOT
    with pytest.raises(Conflict):
        update_settings(task.id, revision=99, work_type=WorkType.objects.get(pk="feature"))


def test_creation_snapshots_selected_work_type_and_rejects_raw_profile(profiles, local_client):
    response = local_client.post(
        "/api/v1/tasks/",
        {"title": "Feature", "work_type": "feature"},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 201
    assert response.json()["workflow_snapshot"]["key"] == "spec-driven"
    response = local_client.post(
        "/api/v1/tasks/",
        {"title": "Injected", "workflow_snapshot": {}},
        format="json",
        **csrf(local_client),
    )
    assert response.status_code == 400


def test_unknown_contract_and_duplicate_steps_fail_closed(profiles, local_client):
    workflow = WorkflowDefinition.objects.get(pk="spec-driven")
    for mutation in ["version", "duplicate"]:
        profile = deepcopy(workflow.execution_profile)
        if mutation == "version":
            profile["result_contract"] = 999
        else:
            profile["steps"].append(profile["steps"][0])
        WorkflowDefinition.objects.filter(pk=workflow.pk).update(execution_profile=profile)
        with pytest.raises(ValidationError):
            snapshot_for(WorkType.objects.get(pk="feature"))
        response = local_client.post(
            "/api/v1/tasks/",
            {"title": "Rejected", "work_type": "feature"},
            format="json",
            **csrf(local_client),
        )
        assert response.status_code == 400
        assert not Task.objects.filter(title="Rejected").exists()


@pytest.mark.parametrize("agent", ["codex", "claude", "pi"])
def test_profiled_execution_and_evidence_across_adapters(
    profiles, repository, fake_cli, settings, tmp_path, agent
):
    settings.DATA_DIR = tmp_path / "data"
    fake_cli(agent, "implement")
    work_type = WorkType.objects.get(pk="bug")
    task = Task.objects.create(
        title="Profiled regression",
        repository=repository,
        routing_mode="local_only" if agent == "pi" else "frontier",
        frontier_agent=None if agent == "pi" else agent,
        work_type=work_type,
        workflow_snapshot=snapshot_for(work_type),
    )
    act(task.id, action="start", revision=0)
    for stage in ["plan", "integrate", "code_review"]:
        assert Worker().run_once()
        task.refresh_from_db()
        run = task.runs.first()
        assert run.state == "succeeded", run.error
        assert run.input_context["workflow"] == task.workflow_snapshot
        assert {report["step_id"] for report in run.result["workflow_steps"]} == {
            step["id"] for step in task.workflow_snapshot["steps"] if step["stage"] == stage
        }
        act(
            task.id,
            action="approve",
            revision=task.revision,
            run_id=run.id,
            fingerprint=run.review_fingerprint,
        )
    task.refresh_from_db()
    run = task.runs.first()
    act(
        task.id,
        action="final_approve",
        revision=task.revision,
        run_id=run.id,
        fingerprint=run.review_fingerprint,
    )
    task.refresh_from_db()
    assert task.completed_at


@pytest.mark.parametrize(
    "mutation",
    ["missing", "duplicate", "wrong_stage", "invalid_index", "skip_required", "failed_step"],
)
def test_invalid_step_evidence_cannot_complete(profiles, mutation):
    snapshot = snapshot_for(WorkType.objects.get(pk="bug"))
    reports = [
        {"step_id": step["id"], "outcome": "complete", "summary": "Recorded", "test_indexes": [0]}
        for step in snapshot["steps"]
        if step["stage"] == "integrate"
    ]
    value = {
        "outcome": "complete",
        "summary": "Done",
        "details": "Evidence",
        "tests": [{"command": "pytest", "outcome": "pass", "details": "Passed"}],
        "workflow_steps": reports,
        "artifacts": {"decision": None},
    }
    if mutation == "missing":
        reports.pop()
    elif mutation == "duplicate":
        reports.append(deepcopy(reports[0]))
    elif mutation == "wrong_stage":
        reports[0]["step_id"] = "review"
    elif mutation == "invalid_index":
        reports[0]["test_indexes"] = [True]
    elif mutation == "skip_required":
        reports[0]["outcome"] = "not_applicable"
    else:
        reports[0]["outcome"] = "failed"
    with pytest.raises(RunnerFailure):
        validate_result(value, "integrate", snapshot)


@pytest.mark.parametrize(
    ("mode", "agent"),
    [("frontier", "codex"), ("frontier", "claude"), ("hybrid", "codex"), ("local_only", None)],
)
def test_discovery_delivers_a_reviewed_decision_without_edits(
    profiles, repository, fake_cli, settings, tmp_path, mode, agent
):
    from pathlib import Path

    settings.DATA_DIR = tmp_path / "data"
    for runner in ["codex", "claude", "pi"]:
        fake_cli(runner, "implement")
    work_type = WorkType.objects.get(pk="research")
    task = Task.objects.create(
        title="Queue discovery",
        repository=repository,
        routing_mode=mode,
        frontier_agent=agent,
        work_type=work_type,
        workflow_snapshot=snapshot_for(work_type),
    )
    act(task.id, action="start", revision=0)
    for stage in ["plan", "integrate", "code_review"]:
        assert Worker().run_once()
        task.refresh_from_db()
        run = task.runs.first()
        assert run.state == "succeeded", run.error
        assert run.result["tests"] == []
        if stage == "integrate":
            assert run.result["artifacts"]["decision"]["options"]
        if stage == "code_review":
            assert run.input_context["artifacts"]["implementation"]["result"]["artifacts"][
                "decision"
            ]
        act(
            task.id,
            action="approve",
            revision=task.revision,
            run_id=run.id,
            fingerprint=run.review_fingerprint,
        )
    task.refresh_from_db()
    run = task.runs.first()
    act(
        task.id,
        action="final_approve",
        revision=task.revision,
        run_id=run.id,
        fingerprint=run.review_fingerprint,
    )
    task.refresh_from_db()
    assert task.completed_at
    assert not (Path(task.workspace_path) / "feature.txt").exists()
    for runner in ["codex", "claude", "pi"]:
        args = arguments(runner, "integrate", Path("schema.json"), task.workflow_snapshot)
        assert "workspace-write" not in args
        if runner != "codex":
            tools = args[args.index("--tools") + 1]
            assert "write" not in tools.lower() and "bash" not in tools.lower()


def test_discovery_workspace_mutation_is_blocked(
    profiles, repository, fake_cli, settings, tmp_path
):
    settings.DATA_DIR = tmp_path / "data"
    fake_cli("codex", "implement")
    task = Task.objects.create(
        title="Read-only discovery",
        repository=repository,
        workflow_snapshot=snapshot_for(WorkType.objects.get(pk="research")),
    )
    act(task.id, action="start", revision=0)
    Worker().run_once()
    task.refresh_from_db()
    run = task.runs.first()
    act(
        task.id,
        action="approve",
        revision=task.revision,
        run_id=run.id,
        fingerprint=run.review_fingerprint,
    )
    fake_cli("codex", "modify")
    Worker().run_once()
    run = task.runs.first()
    assert run.state == "blocked" and "changed workspace" in run.error


def test_discovery_requires_decision_artifact(profiles):
    snapshot = snapshot_for(WorkType.objects.get(pk="research"))
    result = {
        "outcome": "complete",
        "summary": "Done",
        "details": "Findings",
        "tests": [],
        "workflow_steps": [
            {
                "step_id": step["id"],
                "outcome": "complete",
                "summary": "Recorded",
                "test_indexes": [],
            }
            for step in snapshot["steps"]
            if step["stage"] == "integrate"
        ],
        "artifacts": {"decision": None},
    }
    with pytest.raises(RunnerFailure, match="decision artifact"):
        validate_result(result, "integrate", snapshot)
