import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_operations_upgrade_preserves_tasks_runs_and_decisions():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    before = [node for node in latest if node[0] not in {"tasks", "workflows"}]
    before += [("tasks", "0011_support_actions"), ("workflows", "0003_consolidate_workflows")]
    try:
        executor.migrate(before)
        old = executor.loader.project_state(before).apps
        task_model = old.get_model("tasks", "Task")
        run_model = old.get_model("tasks", "AgentRun")
        decision_model = old.get_model("tasks", "Decision")
        saved = []
        for stage, state, completed in [
            ("backlog", None, False),
            ("plan", "queued", False),
            ("integrate", "succeeded", False),
            ("code_review", "interrupted", False),
            ("final_approval", "succeeded", True),
        ]:
            task = task_model.objects.create(
                title=f"Preserve {stage}",
                status=stage,
                revision=7,
                routing_mode="hybrid",
                frontier_agent="claude",
                workspace_path="historical-workspace",
                branch="historical-branch",
                completed_at=timezone.now() if completed else None,
            )
            run = None
            if state:
                run = run_model.objects.create(
                    task=task,
                    sequence=3,
                    stage="test" if completed else stage,
                    agent="pi",
                    state=state,
                    result={"summary": "Historical evidence"},
                    review_fingerprint="a" * 64,
                    input_context={"historical": True},
                )
                decision_model.objects.create(
                    task=task,
                    run=run,
                    action="final_approve" if completed else "revise",
                    from_stage=stage,
                    to_stage=stage,
                    task_revision=6,
                    feedback="Keep this decision",
                )
            saved.append((task.pk, stage, state, completed, run.pk if run else None))
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        current = executor.loader.project_state(latest).apps
        for task_id, stage, state, completed, run_id in saved:
            task = current.get_model("tasks", "Task").objects.get(pk=task_id)
            assert task.status == stage and task.revision == 7
            assert bool(task.completed_at) == completed and task.work_type_id is None
            assert task.workflow_snapshot["key"] == "legacy-standard"
            assert (
                task.workspace_path == "historical-workspace" and task.branch == "historical-branch"
            )
            assert task.routing_mode == "hybrid" and task.frontier_agent == "claude"
            if run_id:
                run = current.get_model("tasks", "AgentRun").objects.get(pk=run_id)
                assert run.state == state and run.agent == "pi"
                assert run.result == {"summary": "Historical evidence"}
                assert (
                    run.input_context == {"historical": True} and run.review_fingerprint == "a" * 64
                )
                assert (
                    current.get_model("tasks", "Decision").objects.get(run_id=run_id).feedback
                    == "Keep this decision"
                )
    finally:
        MigrationExecutor(connection).migrate(latest)
