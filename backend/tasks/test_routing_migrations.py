import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_upgrade_requires_routing_preserves_runs_and_reopens_unreviewed_tasks():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    old = [("tasks", "0005_agentrun_cli_version_agentrun_input_context_and_more")]
    try:
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        Task = apps.get_model("tasks", "Task")
        Run = apps.get_model("tasks", "AgentRun")
        Assignment = apps.get_model("tasks", "ColumnAssignment")
        Assignment.objects.create(stage="plan", agent="claude")
        backlog = Task.objects.create(title="Old backlog")
        active = Task.objects.create(title="Old queue", status="plan")
        queued = Run.objects.create(task=active, stage="plan", agent="claude", sequence=1)
        final = Task.objects.create(title="Old final", status="final_approval", revision=9)
        test = Run.objects.create(
            task=final, stage="test", agent="pi", sequence=1, state="succeeded"
        )
        completed = Task.objects.create(
            title="Approved",
            status="final_approval",
            completed_at=timezone.now(),
            revision=5,
        )
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        Task = apps.get_model("tasks", "Task")
        Run = apps.get_model("tasks", "AgentRun")
        for identity in [backlog.id, active.id, final.id, completed.id]:
            task = Task.objects.get(pk=identity)
            assert task.routing_mode is None and task.frontier_agent is None
        assert Run.objects.get(pk=queued.id).agent == "claude"
        assert Run.objects.get(pk=queued.id).state == "queued"
        assert Run.objects.get(pk=test.id).stage == "test"
        assert Task.objects.get(pk=final.id).status == "test"
        assert Task.objects.get(pk=final.id).revision == 10
        assert Task.objects.get(pk=completed.id).status == "final_approval"
        assert Task.objects.get(pk=completed.id).revision == 5
        assert Task.objects.get(pk=completed.id).completed_at == completed.completed_at
        assert "tasks_columnassignment" not in connection.introspection.table_names()
    finally:
        MigrationExecutor(connection).migrate(latest)
