from copy import deepcopy
from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from .graph import graph_projection, ordered_nodes, validate_graph
from .models import WorkflowDefinition, WorkType


def test_first_graph_preserves_practices_and_only_maps_one_workflow(catalogue):
    assert WorkflowDefinition.objects.filter(graph__isnull=False).count() == 1
    workflow = WorkflowDefinition.objects.get(pk="plan-execute")
    graph = validate_graph(workflow.graph)
    assert [node["id"] for node in ordered_nodes(graph)] == [
        "scope",
        "implement",
        "validate",
        "accept",
    ]
    assert workflow.graph_revision == 1 and workflow.graph_updated_at is not None
    projection = graph_projection(graph)
    assert len(projection["approval_points"]) == 2
    assert "documentation builds" in projection["validation"][-1]
    assert "When relevant: For documentation changes." in projection["validation"][-1]
    assert any("audience" in req["description"] for req in graph["nodes"][0]["requirements"])


def test_reseeding_and_rollback_preserve_user_edits(catalogue):
    migration = import_module("workflows.migrations.0005_plan_execute_graph")
    snapshot = list(WorkType.objects.values())
    workflow = WorkflowDefinition.objects.get(pk="plan-execute")
    graph = deepcopy(workflow.graph)
    graph["nodes"][0]["title"] = "Edited scope"
    WorkflowDefinition.objects.filter(pk=workflow.pk).update(graph=graph, graph_revision=2)
    migration.seed_graph(apps, connection.schema_editor())
    migration.unseed_graph(apps, connection.schema_editor())
    workflow.refresh_from_db()
    assert workflow.graph == graph and workflow.graph_revision == 2
    assert list(WorkType.objects.values()) == snapshot


@pytest.mark.django_db(transaction=True)
def test_graph_upgrade_and_untouched_seed_rollback_preserve_assignments():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    before = [node for node in latest if node[0] not in {"workflows", "tasks"}]
    before.append(("tasks", "0011_support_actions"))
    before.append(("workflows", "0003_consolidate_workflows"))
    try:
        executor.migrate(before)
        old_apps = executor.loader.project_state(before).apps
        seed = import_module("workflows.migrations.0002_seed_catalogue")
        seed.seed_catalogue(old_apps, connection.schema_editor())
        merge = import_module("workflows.migrations.0003_consolidate_workflows")
        merge.consolidate_catalogue(old_apps, connection.schema_editor())
        old_types = old_apps.get_model("workflows", "WorkType")
        old_types.objects.filter(pk="maintenance").update(
            assigned_workflow_id="test-driven", revision=12
        )
        snapshot = list(old_types.objects.values())
        MigrationExecutor(connection).migrate(latest)
        assert list(WorkType.objects.values()) == snapshot
        assert WorkflowDefinition.objects.filter(graph__isnull=False).count() == 1
        migration = import_module("workflows.migrations.0005_plan_execute_graph")
        migration.unseed_graph(apps, connection.schema_editor())
        assert not WorkflowDefinition.objects.filter(graph__isnull=False).exists()
        migration.seed_graph(apps, connection.schema_editor())
        assert WorkflowDefinition.objects.get(pk="plan-execute").graph_revision == 1
        assert list(WorkType.objects.values()) == snapshot
    finally:
        MigrationExecutor(connection).migrate(latest)
