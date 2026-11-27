from copy import deepcopy
from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from rest_framework.exceptions import ValidationError
from workflows.models import WorkflowDefinition, WorkType
from workflows.profiles import LEGACY_SNAPSHOT, snapshot_for

from .conftest import csrf
from .models import AgentRun, Task
from .workflow import Conflict, update_settings

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
