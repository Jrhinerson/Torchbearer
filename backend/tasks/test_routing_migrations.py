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
        # Rebuild the historical schema from a shared baseline. Rolling back only
        # one sibling branch can leave SQLite table state from the other branch.
        executor.migrate([("tasks", None), ("projects", None)])
        executor = MigrationExecutor(connection)
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


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("branch", ["projects", "routing"])
def test_merge_upgrades_either_feature_branch_without_losing_task_settings(branch):
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    old = [
        (
            "tasks",
            "0006_merge_projects_and_workflow"
            if branch == "projects"
            else "0008_remove_column_routing",
        )
    ]
    try:
        executor.migrate([("tasks", None), ("projects", None)])
        executor = MigrationExecutor(connection)
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        Repository = apps.get_model("tasks", "Repository")
        Task = apps.get_model("tasks", "Task")
        Run = apps.get_model("tasks", "AgentRun")
        repository = Repository.objects.create(name="Saved source", path="C:/migration/source")
        fields = {"repository": repository, "status": "plan"}
        if branch == "projects":
            Project = apps.get_model("projects", "Project")
            fields["project"] = Project.objects.create(
                name="Preserved project",
                path=repository.path,
                archived=True,
            )
        else:
            fields.update(routing_mode="hybrid", frontier_agent="claude")
        task = Task.objects.create(title="Preserved task", **fields)
        run = Run.objects.create(task=task, stage="plan", agent="claude", sequence=1)
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        saved = apps.get_model("tasks", "Task").objects.get(pk=task.pk)
        project = apps.get_model("projects", "Project").objects.get(pk=saved.project_id)
        assert saved.repository_id == repository.id
        assert saved.status == "plan"
        assert project.path == repository.path
        if branch == "projects":
            assert saved.routing_mode is None and saved.frontier_agent is None
            assert project.name == "Preserved project" and project.archived
        else:
            assert saved.routing_mode == "hybrid" and saved.frontier_agent == "claude"
        saved_run = apps.get_model("tasks", "AgentRun").objects.get(pk=run.pk)
        assert saved_run.agent == "claude" and saved_run.state == "queued"
    finally:
        MigrationExecutor(connection).migrate(latest)
