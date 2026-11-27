"""Frozen first authored DAG; never replace a user's edited definition."""

from django.db import migrations
from django.utils import timezone

GRAPH = {
    "schema_version": 1,
    "entry_node_id": "scope",
    "nodes": [
        {
            "id": "scope",
            "title": "Define scope",
            "description": "Agree the change and acceptance criteria.",
            "requirements": [
                {
                    "id": "scope-criteria",
                    "description": "Record the scope and acceptance criteria.",
                    "kind": "requirement",
                    "applicability": "always",
                },
                {
                    "id": "scope-audience",
                    "description": "Identify the audience and information gap.",
                    "kind": "requirement",
                    "applicability": "when_relevant",
                    "applicability_note": "For documentation changes.",
                },
                {
                    "id": "scope-approval",
                    "description": "Approve the brief plan.",
                    "kind": "approval",
                    "applicability": "always",
                },
            ],
            "outputs": ["Scope and acceptance checklist"],
            "iteration_note": "",
            "position": {"x": 0, "y": 60},
        },
        {
            "id": "implement",
            "title": "Implement",
            "description": "Make the change or draft the documentation.",
            "requirements": [
                {
                    "id": "implement-scope",
                    "description": "Implement the agreed scope.",
                    "kind": "requirement",
                    "applicability": "always",
                },
                {
                    "id": "implement-ready",
                    "description": "Prepare the change or documentation for validation.",
                    "kind": "requirement",
                    "applicability": "always",
                },
            ],
            "outputs": ["Implemented change or documentation draft"],
            "iteration_note": "",
            "position": {"x": 360, "y": 60},
        },
        {
            "id": "validate",
            "title": "Validate",
            "description": "Verify affected behavior and documentation.",
            "requirements": [
                {
                    "id": "validate-checks",
                    "description": (
                        "Pass checks appropriate to the affected behavior and environment."
                    ),
                    "kind": "validation",
                    "applicability": "always",
                },
                {
                    "id": "validate-evidence",
                    "description": "Record validation commands, outcomes, and any limitations.",
                    "kind": "validation",
                    "applicability": "always",
                },
                {
                    "id": "validate-docs",
                    "description": (
                        "Verify technical accuracy, examples, commands, links, "
                        "and applicable documentation builds."
                    ),
                    "kind": "validation",
                    "applicability": "when_relevant",
                    "applicability_note": "For documentation changes.",
                },
            ],
            "outputs": ["Change and validation evidence ready for review"],
            "iteration_note": "",
            "position": {"x": 720, "y": 60},
        },
        {
            "id": "accept",
            "title": "Review and accept",
            "description": "Review the result against the agreed scope.",
            "requirements": [
                {
                    "id": "accept-review",
                    "description": "Review acceptance criteria, accuracy, and clarity.",
                    "kind": "requirement",
                    "applicability": "always",
                },
                {
                    "id": "accept-approval",
                    "description": "Accept the reviewed result through the repository process.",
                    "kind": "approval",
                    "applicability": "always",
                },
            ],
            "outputs": ["Reviewed and accepted change or documentation with validation evidence"],
            "iteration_note": "",
            "position": {"x": 1080, "y": 60},
        },
    ],
    "edges": [
        {
            "id": "scope-implement",
            "source": "scope",
            "target": "implement",
            "condition": "Plan approved",
        },
        {
            "id": "implement-validate",
            "source": "implement",
            "target": "validate",
            "condition": "Change ready",
        },
        {
            "id": "validate-accept",
            "source": "validate",
            "target": "accept",
            "condition": "Checks passed",
        },
    ],
}


def seed_graph(apps, schema_editor):
    workflow = apps.get_model("workflows", "WorkflowDefinition")
    workflow.objects.using(schema_editor.connection.alias).filter(
        pk="plan-execute", graph__isnull=True
    ).update(graph=GRAPH, graph_revision=1, graph_updated_at=timezone.now())


def unseed_graph(apps, schema_editor):
    workflow = apps.get_model("workflows", "WorkflowDefinition")
    workflow.objects.using(schema_editor.connection.alias).filter(
        pk="plan-execute", graph=GRAPH, graph_revision=1
    ).update(graph=None, graph_revision=0, graph_updated_at=None)


class Migration(migrations.Migration):
    dependencies = [("workflows", "0004_workflow_graph")]
    operations = [migrations.RunPython(seed_graph, unseed_graph)]
