from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models.deletion import ProtectedError
from tasks.models import Task

from .models import WorkflowDefinition, WorkType


def test_catalogue_is_complete_and_preserves_custom_assignments(catalogue):
    assert WorkflowDefinition.objects.count() == 18
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
    work_type.refresh_from_db()
    task.refresh_from_db()
    assert work_type.assigned_workflow_id == "test-driven"
    assert work_type.recommended_workflow_id == "diagnose-regression"
    assert work_type.revision == 3
    assert WorkflowDefinition.objects.count() == 18 and WorkType.objects.count() == 19
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
        assert new_apps.get_model("workflows", "WorkflowDefinition").objects.count() == 18
    finally:
        MigrationExecutor(connection).migrate(latest)
