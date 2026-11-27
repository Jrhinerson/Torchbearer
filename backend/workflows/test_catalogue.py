from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models.deletion import ProtectedError
from tasks.models import Task

from .models import WorkflowDefinition, WorkType


def test_catalogue_is_complete_and_preserves_custom_assignments(catalogue):
    assert WorkflowDefinition.objects.count() == 15
    assert WorkType.objects.count() == 19
    assert WorkType.objects.get(key="bug").assigned_workflow_id == "diagnose-regression"
    assert WorkType.objects.get(key="feature").assigned_workflow_id == "spec-driven"
    for workflow in WorkflowDefinition.objects.all():
        for field in ["steps", "outputs", "validation", "approval_points"]:
            values = getattr(workflow, field)
            assert values and all(isinstance(value, str) and value.strip() for value in values)
    work_type = WorkType.objects.get(key="bug")
    work_type.assigned_workflow_id = "test-driven"
    work_type.revision = 3
    work_type.save()
    task = Task.objects.create(title="Existing task", revision=7, routing_mode="hybrid")
    migration = import_module("workflows.migrations.0002_seed_catalogue")
    migration.seed_catalogue(apps, connection.schema_editor())
    migration = import_module("workflows.migrations.0003_consolidate_workflows")
    migration.consolidate_catalogue(apps, connection.schema_editor())
    work_type.refresh_from_db()
    task.refresh_from_db()
    assert work_type.assigned_workflow_id == "test-driven"
    assert work_type.recommended_workflow_id == "diagnose-regression"
    assert work_type.revision == 3
    assert WorkflowDefinition.objects.count() == 15 and WorkType.objects.count() == 19
    assert task.title == "Existing task" and task.revision == 7 and task.status == "backlog"


def test_workflows_referenced_by_types_cannot_be_deleted(catalogue):
    with pytest.raises(ProtectedError):
        WorkflowDefinition.objects.get(key="plan-execute").delete()


@pytest.mark.django_db(transaction=True)
def test_seed_migration_preserves_existing_task_data():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    before_seed = [node for node in latest if node[0] != "workflows"]
    before_seed.append(("workflows", "0001_initial"))
    try:
        executor.migrate(before_seed)
        old_apps = executor.loader.project_state(before_seed).apps
        task = old_apps.get_model("tasks", "Task").objects.create(
            title="Keep this task", revision=9
        )
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        new_apps = executor.loader.project_state(latest).apps
        saved = new_apps.get_model("tasks", "Task").objects.get(pk=task.pk)
        assert saved.title == "Keep this task" and saved.revision == 9
        assert new_apps.get_model("workflows", "WorkType").objects.count() == 19
        assert new_apps.get_model("workflows", "WorkflowDefinition").objects.count() == 15
    finally:
        MigrationExecutor(connection).migrate(latest)


@pytest.mark.django_db(transaction=True)
def test_consolidation_migrates_defaults_and_custom_assignments_once():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    before = [node for node in latest if node[0] != "workflows"]
    before.append(("workflows", "0002_seed_catalogue"))
    assignments = {
        "documentation": ("test-driven", "docs-as-code", 12),
        "api-integration": ("contract-testing", "contract-testing", 4),
        "architecture": ("design-proposal", "design-proposal", 5),
        "bug": ("docs-as-code", "diagnose-regression", 6),
        "maintenance": ("design-proposal", "plan-execute", 3),
        "business-logic": ("contract-testing", "test-driven", 10),
        "feature": ("test-driven", "spec-driven", 8),
    }
    equivalents = {
        "docs-as-code": "plan-execute",
        "contract-testing": "spec-driven",
        "design-proposal": "timeboxed-discovery",
    }
    try:
        executor.migrate(before)
        old_apps = executor.loader.project_state(before).apps
        seed = import_module("workflows.migrations.0002_seed_catalogue")
        seed.seed_catalogue(old_apps, connection.schema_editor())
        old_types = old_apps.get_model("workflows", "WorkType")
        for key, (assigned, recommended, revision) in assignments.items():
            old_types.objects.filter(pk=key).update(
                assigned_workflow_id=assigned,
                recommended_workflow_id=recommended,
                revision=revision,
            )
        previous_timestamps = dict(old_types.objects.values_list("key", "updated_at"))
        task = old_apps.get_model("tasks", "Task").objects.create(
            title="Preserve task and agent history", revision=9
        )
        run = old_apps.get_model("tasks", "AgentRun").objects.create(
            task=task,
            sequence=1,
            stage="integrate",
            agent="codex",
            state="succeeded",
            result={"summary": "Historical implementation evidence"},
        )

        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        new_apps = executor.loader.project_state(latest).apps
        new_types = new_apps.get_model("workflows", "WorkType")
        new_workflows = new_apps.get_model("workflows", "WorkflowDefinition")
        assert new_workflows.objects.count() == 15 and new_types.objects.count() == 19
        assert not new_workflows.objects.filter(pk__in=equivalents).exists()
        for key, (assigned, recommended, revision) in assignments.items():
            saved = new_types.objects.get(pk=key)
            changed = assigned in equivalents or recommended in equivalents
            assert saved.assigned_workflow_id == equivalents.get(assigned, assigned)
            assert saved.recommended_workflow_id == equivalents.get(recommended, recommended)
            assert saved.revision == revision + int(changed)
            if changed:
                assert saved.updated_at > previous_timestamps[key]
            else:
                assert saved.updated_at == previous_timestamps[key]
        saved_task = new_apps.get_model("tasks", "Task").objects.get(pk=task.pk)
        saved_run = new_apps.get_model("tasks", "AgentRun").objects.get(pk=run.pk)
        assert saved_task.revision == 9 and saved_task.status == "backlog"
        assert saved_run.result == {"summary": "Historical implementation evidence"}
        assert saved_run.state == "succeeded" and saved_run.agent == "codex"

        snapshot = list(new_types.objects.values())
        migration = import_module("workflows.migrations.0003_consolidate_workflows")
        migration.consolidate_catalogue(new_apps, connection.schema_editor())
        assert list(new_types.objects.values()) == snapshot

        # Downgrading restores the old choices without guessing which old alias a
        # saved assignment used. Reapplying must keep all current assignments valid.
        MigrationExecutor(connection).migrate(before)
        assert new_workflows.objects.count() == 18
        assert list(new_types.objects.values()) == snapshot
        MigrationExecutor(connection).migrate(latest)
        assert new_workflows.objects.count() == 15
        assert list(new_types.objects.values()) == snapshot
    finally:
        MigrationExecutor(connection).migrate(latest)
