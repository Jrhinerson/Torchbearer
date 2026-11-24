from django.db import migrations, models
from django.utils import timezone


def require_integrated_validation(apps, schema_editor):
    Task = apps.get_model("tasks", "Task")
    Run = apps.get_model("tasks", "AgentRun")
    now = timezone.now()
    for task in Task.objects.filter(
        completed_at__isnull=True, status__in=["test", "code_review", "final_approval"]
    ).iterator():
        latest = Run.objects.filter(task=task).order_by("-sequence").first()
        Run.objects.filter(task=task, state__in=["queued", "running"]).update(
            state="interrupted", finished_at=now,
            error="Test was removed. Resume this task in Integrate after upgrading.",
        )
        agent = (
            "pi" if task.routing_mode in {"hybrid", "local_only"}
            else task.frontier_agent or (latest.agent if latest else "codex")
        )
        Run.objects.create(
            task=task, sequence=latest.sequence + 1 if latest else 1,
            stage="integrate", agent=agent, state="interrupted", finished_at=now,
            error="Test was removed. Review the workspace and retry Integrate to produce "
                  "current implementation and validation evidence before Code Review.",
        )
        Task.objects.filter(pk=task.pk).update(
            status="integrate", revision=models.F("revision") + 1, updated_at=now,
        )


class Migration(migrations.Migration):
    dependencies = [("tasks", "0009_merge_projects_and_task_routing")]

    operations = [
        migrations.AlterField(
            model_name="task", name="status",
            field=models.CharField(
                choices=[("backlog", "Backlog"), ("plan", "Plan"),
                         ("integrate", "Integrate"), ("code_review", "Code Review"),
                         ("final_approval", "Final Approval")],
                default="backlog", editable=False, max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="agentrun", name="stage",
            field=models.CharField(
                choices=[("plan", "Plan"), ("integrate", "Integrate"),
                         ("code_review", "Code Review"), ("test", "Test (legacy)")],
                max_length=20,
            ),
        ),
        migrations.RunPython(require_integrated_validation, migrations.RunPython.noop),
    ]
