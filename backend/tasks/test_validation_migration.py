import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_removed_test_stage_preserves_history_and_requires_fresh_validation():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    old = [("tasks", "0009_merge_projects_and_task_routing")]
    try:
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        Task = apps.get_model("tasks", "Task")
        Run = apps.get_model("tasks", "AgentRun")
        tasks = []
        for status in ["test", "code_review", "final_approval"]:
            task = Task.objects.create(
                title=status,
                status=status,
                routing_mode="hybrid",
                frontier_agent="claude",
                revision=4,
            )
            report = Run.objects.create(
                task=task,
                stage="test",
                sequence=1,
                agent="pi",
                state="succeeded",
                result={"summary": "Historical evidence"},
                review_fingerprint="old",
            )
            queued = Run.objects.create(
                task=task,
                stage=status if status != "final_approval" else "code_review",
                sequence=2,
                agent="claude",
                state="queued",
            )
            tasks.append((task.pk, report.pk, queued.pk))
        completed = Task.objects.create(
            title="Accepted",
            status="final_approval",
            completed_at=timezone.now(),
            revision=8,
        )
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        Task = apps.get_model("tasks", "Task")
        Run = apps.get_model("tasks", "AgentRun")
        for task_id, report_id, queued_id in tasks:
            task = Task.objects.get(pk=task_id)
            assert task.status == "integrate" and task.revision == 5
            assert Run.objects.get(pk=report_id).result == {"summary": "Historical evidence"}
            assert Run.objects.get(pk=report_id).review_fingerprint == "old"
            assert Run.objects.get(pk=queued_id).state == "interrupted"
            marker = Run.objects.get(task=task, sequence=3)
            assert marker.stage == "integrate" and marker.state == "interrupted"
            assert marker.agent == "pi" and not marker.review_fingerprint
            assert not Run.objects.filter(task=task, state__in=["queued", "running"]).exists()
        saved = Task.objects.get(pk=completed.pk)
        assert saved.completed_at == completed.completed_at and saved.revision == 8
        assert not Run.objects.filter(task=saved).exists()
    finally:
        MigrationExecutor(connection).migrate(latest)
