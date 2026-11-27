"""Join the independently applied graph and execution-profile migrations."""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("workflows", "0004_workflowdefinition_definition_version_and_more"),
        ("workflows", "0005_plan_execute_graph"),
    ]

    operations = []
