"""Share overlapping workflows while retaining their concrete engineering practices."""

from importlib import import_module

from django.db import migrations
from django.db.models import F, Q
from django.utils import timezone

MERGED_WORKFLOWS = {
    "docs-as-code": "plan-execute",
    "contract-testing": "spec-driven",
    "design-proposal": "timeboxed-discovery",
}

WORKFLOWS = {
    "plan-execute": {
        "name": "Plan and execute",
        "description": (
            "Use a short plan and proportionate checks for straightforward changes, "
            "including documentation developed and reviewed as code."
        ),
        "steps": [
            "Define scope and acceptance criteria; identify the audience for documentation",
            "Implement the change or draft the documentation",
            "Validate affected behavior; verify documentation examples, commands, and links",
            "Review accuracy and clarity, then accept through the repository process",
        ],
        "outputs": [
            "Scope and acceptance checklist",
            "Reviewed change or documentation and relevant validation evidence",
        ],
        "validation": [
            "Run checks appropriate to the affected behavior and environment",
            "For documentation, verify technical accuracy, examples, links, and applicable builds",
        ],
        "approval_points": ["Approve the brief plan", "Accept the reviewed result"],
    },
    "spec-driven": {
        "name": "Spec-driven development",
        "description": (
            "Carry an agreed specification through implementation and acceptance, "
            "using contract tests when changing interfaces or integrations."
        ),
        "steps": [
            "Specify behavior and acceptance criteria",
            "Specify interface requests, responses, errors, authentication, and compatibility",
            "Resolve open questions and plan independently verifiable slices",
            "Define contract tests for affected integrations",
            "Implement and validate each slice",
            "Review against the specification and verify affected contracts",
        ],
        "outputs": [
            "Approved specification and technical plan",
            "Interface contracts and compatibility decisions when applicable",
            "Implementation and acceptance evidence, including relevant contract tests",
        ],
        "validation": [
            "Verify acceptance criteria and edge cases; run agreed regression checks",
            "For integrations, test contracts, authentication, compatibility, and failure paths",
            "Verify integrations in a representative environment",
        ],
        "approval_points": [
            "Approve the specification, applicable interface contracts, and plan",
            "Accept the implementation against the specification and compatibility evidence",
        ],
    },
    "timeboxed-discovery": {
        "name": "Discovery and design review",
        "description": (
            "Resolve uncertainty through bounded investigation, comparison of alternatives, "
            "and a reviewed decision or architectural proposal."
        ),
        "steps": [
            "State the question, timebox, constraints, and decision criteria",
            "Investigate sources or run scoped experiments and optional disposable prototypes",
            "Compare alternatives against constraints and quality requirements",
            "Document findings, trade-offs, consequences, and the proposed decision",
            "Review the decision and identify implementation slices if proceeding",
        ],
        "outputs": [
            "Evidence, alternatives, findings, and unresolved risks",
            "Reviewed decision or architectural decision record when appropriate",
            "Proceed, clarify, or stop recommendation and implementation breakdown if proceeding",
        ],
        "validation": [
            "Check evidence against the question, constraints, and decision criteria",
            "For architecture, assess compatibility, operational effects, and reversibility",
            "Record limitations and unresolved uncertainty",
        ],
        "approval_points": [
            "Agree the question, timebox, and design criteria",
            "Review the evidence and approve the decision and next steps",
        ],
    },
}


def consolidate_catalogue(apps, schema_editor):
    workflow_model = apps.get_model("workflows", "WorkflowDefinition")
    work_type_model = apps.get_model("workflows", "WorkType")
    database = schema_editor.connection.alias
    for key, values in WORKFLOWS.items():
        workflow_model.objects.using(database).filter(pk=key).update(**values)

    affected = work_type_model.objects.using(database).filter(
        Q(assigned_workflow_id__in=MERGED_WORKFLOWS)
        | Q(recommended_workflow_id__in=MERGED_WORKFLOWS)
    )
    for work_type in list(affected):
        work_type_model.objects.using(database).filter(pk=work_type.pk).update(
            assigned_workflow_id=MERGED_WORKFLOWS.get(
                work_type.assigned_workflow_id, work_type.assigned_workflow_id
            ),
            recommended_workflow_id=MERGED_WORKFLOWS.get(
                work_type.recommended_workflow_id, work_type.recommended_workflow_id
            ),
            revision=F("revision") + 1,
            updated_at=timezone.now(),
        )
    workflow_model.objects.using(database).filter(pk__in=MERGED_WORKFLOWS).delete()


def restore_catalogue(apps, schema_editor):
    # Restore the old choices and definitions. Saved assignments stay on their shared
    # equivalents: consolidating several choices cannot recover an individual old choice.
    workflow_model = apps.get_model("workflows", "WorkflowDefinition")
    database = schema_editor.connection.alias
    original = import_module("workflows.migrations.0002_seed_catalogue")
    fields = ["name", "description", "steps", "outputs", "validation", "approval_points"]
    for order, (key, *values) in enumerate(original.WORKFLOWS):
        if key in WORKFLOWS or key in MERGED_WORKFLOWS:
            workflow_model.objects.using(database).update_or_create(
                key=key,
                defaults={**dict(zip(fields, values, strict=True)), "display_order": order},
            )


class Migration(migrations.Migration):
    dependencies = [("workflows", "0002_seed_catalogue")]

    operations = [migrations.RunPython(consolidate_catalogue, restore_catalogue)]
