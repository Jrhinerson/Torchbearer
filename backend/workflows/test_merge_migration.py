"""Both previously deployed migration branches can reach the combined schema."""

from copy import deepcopy
from importlib import import_module

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("branch", ["graph", "profiles"])
def test_merge_preserves_saved_graphs_profiles_and_snapshots(branch):
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    before = [node for node in latest if node[0] not in {"workflows", "tasks"}]
    before.extend(
        [
            (
                "tasks",
                "0011_support_actions"
                if branch == "graph"
                else "0012_task_work_type_task_workflow_snapshot",
            ),
            (
                "workflows",
                "0005_plan_execute_graph"
                if branch == "graph"
                else "0004_workflowdefinition_definition_version_and_more",
            ),
        ]
    )
    try:
        # Targeting one branch alone doesn't unapply its sibling. Rebuild from
        # their common ancestor so the schema really matches the old app state.
        common = [node for node in latest if node[0] not in {"workflows", "tasks"}]
        common.extend(
            [("tasks", "0011_support_actions"), ("workflows", "0003_consolidate_workflows")]
        )
        executor.migrate(common)
        common_apps = executor.loader.project_state(common).apps
        for name, function in [
            ("0002_seed_catalogue", "seed_catalogue"),
            ("0003_consolidate_workflows", "consolidate_catalogue"),
        ]:
            getattr(import_module(f"workflows.migrations.{name}"), function)(
                common_apps, connection.schema_editor()
            )
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        old_apps = executor.loader.project_state(before).apps
        definitions = old_apps.get_model("workflows", "WorkflowDefinition")
        types = old_apps.get_model("workflows", "WorkType")
        tasks = old_apps.get_model("tasks", "Task")
        types.objects.filter(pk="maintenance").update(
            assigned_workflow_id="test-driven", revision=9
        )
        assignments = list(types.objects.order_by("key").values())
        definition = definitions.objects.get(pk="plan-execute")
        if branch == "graph":
            saved_graph = deepcopy(definition.graph)
            saved_graph["nodes"][0]["title"] = "Previously edited scope"
            definitions.objects.filter(pk=definition.pk).update(graph=saved_graph, graph_revision=8)
            task = tasks.objects.create(title="Keep existing task", revision=5)
        else:
            saved_profile = deepcopy(definition.execution_profile)
            saved_profile["steps"][0]["label"] = "Previously reviewed scope"
            definitions.objects.filter(pk=definition.pk).update(execution_profile=saved_profile)
            snapshot = {**saved_profile, "key": "plan-execute", "name": definition.name}
            task = tasks.objects.create(
                title="Keep frozen snapshot",
                revision=5,
                workflow_snapshot=snapshot,
                work_type_id="maintenance",
            )
        MigrationExecutor(connection).migrate(latest)
        new_apps = MigrationExecutor(connection).loader.project_state(latest).apps
        saved = new_apps.get_model("workflows", "WorkflowDefinition").objects.get(pk=definition.pk)
        restored_task = new_apps.get_model("tasks", "Task").objects.get(pk=task.pk)
        assert restored_task.title == task.title and restored_task.revision == 5
        assert (
            list(new_apps.get_model("workflows", "WorkType").objects.order_by("key").values())
            == assignments
        )
        assert saved.graph and saved.execution_profile and saved.definition_version == 1
        if branch == "graph":
            assert saved.graph == saved_graph and saved.graph_revision == 8
        else:
            assert saved.execution_profile == saved_profile
            assert restored_task.workflow_snapshot == snapshot
            assert restored_task.work_type_id == "maintenance"
    finally:
        MigrationExecutor(connection).migrate(latest)
