from django.db import migrations


def preserve_repository_selections(apps, schema_editor):
    Project = apps.get_model("projects", "Project")
    Repository = apps.get_model("tasks", "Repository")
    Task = apps.get_model("tasks", "Task")
    database = schema_editor.connection.alias
    for repository in Repository.objects.using(database).iterator():
        project, _ = Project.objects.using(database).get_or_create(
            path=repository.path, defaults={"name": repository.name[:200]}
        )
        Task.objects.using(database).filter(
            repository_id=repository.pk, project__isnull=True
        ).update(project_id=project.pk)
        Task.objects.using(database).filter(
            project_id=project.pk, repository__isnull=True, status="backlog"
        ).update(repository_id=repository.pk)


class Migration(migrations.Migration):
    dependencies = [
        ("tasks", "0002_task_project"),
        ("tasks", "0005_agentrun_cli_version_agentrun_input_context_and_more"),
    ]

    operations = [migrations.RunPython(preserve_repository_selections, migrations.RunPython.noop)]
