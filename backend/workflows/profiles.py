"""Trusted built-in procedures. Profiles describe work within existing approval stages."""

from copy import deepcopy

from rest_framework.exceptions import ValidationError

SUPPORTED_MODES = set()
LEGACY_SNAPSHOT = {
    "schema_version": 1,
    "key": "legacy-standard",
    "name": "Legacy engineering workflow",
    "definition_version": 1,
    "execution_mode": "legacy",
    "result_contract": 1,
    "steps": [],
    "stage_labels": {},
    "outputs": [],
    "validation": [],
}

# IDs are explicit and stable within a version; labels can evolve in a new version.
PROCEDURES = {
    "plan-execute": [
        ("scope", "plan", "Agree scope"),
        ("implement", "integrate", "Implement change"),
        ("validate", "integrate", "Validate result"),
        ("review", "code_review", "Review accuracy"),
    ],
    "spec-driven": [
        ("spec", "plan", "Agree specification"),
        ("slices", "integrate", "Implement slices"),
        ("contracts", "integrate", "Contract checks", True),
        ("validate", "integrate", "Validate acceptance"),
        ("review", "code_review", "Review against spec"),
    ],
    "test-driven": [
        ("examples", "plan", "Agree behavior examples"),
        ("red", "integrate", "Meaningful failing test"),
        ("green", "integrate", "Implement to pass"),
        ("refactor", "integrate", "Refactor with passing tests"),
        ("review", "code_review", "Review cycles and evidence"),
    ],
    "diagnose-regression": [
        ("diagnose", "plan", "Diagnose cause"),
        ("reproduce", "integrate", "Reproduce failure"),
        ("fix", "integrate", "Correct behavior"),
        ("regress", "integrate", "Regression validation"),
        ("review", "code_review", "Review correction"),
    ],
    "behavior-preserving-refactor": [
        ("scope", "plan", "Define behavior boundary"),
        ("baseline", "integrate", "Establish baseline"),
        ("refactor", "integrate", "Refactor structure"),
        ("verify", "integrate", "Verify preserved behavior"),
        ("review", "code_review", "Review compatibility"),
    ],
    "design-validate": [
        ("design", "plan", "Agree interaction design"),
        ("implement", "integrate", "Implement interface"),
        ("validate", "integrate", "Validate interactions"),
        ("review", "code_review", "Review usability"),
    ],
    "accessibility-remediation": [
        ("audit", "plan", "Identify barriers"),
        ("remediate", "integrate", "Remove barriers"),
        ("verify", "integrate", "Verify accessibility"),
        ("review", "code_review", "Review standards"),
    ],
    "staged-migration": [
        ("strategy", "plan", "Plan migration and recovery"),
        ("migrate", "integrate", "Implement staged migration"),
        ("verify", "integrate", "Validate data and recovery"),
        ("review", "code_review", "Review migration safety"),
    ],
    "measure-optimize": [
        ("hypothesis", "plan", "Define measurement"),
        ("baseline", "integrate", "Measure baseline"),
        ("optimize", "integrate", "Optimize bottleneck"),
        ("measure", "integrate", "Measure improvement"),
        ("review", "code_review", "Review measured result"),
    ],
    "security-focused": [
        ("threats", "plan", "Define threats and scope"),
        ("implement", "integrate", "Implement controls"),
        ("verify", "integrate", "Verify abuse cases"),
        ("review", "code_review", "Review residual risks"),
    ],
    "compatibility-upgrade": [
        ("compatibility", "plan", "Assess compatibility"),
        ("upgrade", "integrate", "Implement upgrade"),
        ("verify", "integrate", "Verify integration"),
        ("review", "code_review", "Review compatibility evidence"),
    ],
    "controlled-operational-change": [
        ("rollout", "plan", "Plan rollout and rollback"),
        ("prepare", "integrate", "Prepare authorized change"),
        ("verify", "integrate", "Validate rollout evidence"),
        ("review", "code_review", "Review operational readiness"),
    ],
    "risk-based-testing": [
        ("risks", "plan", "Identify behavior risks"),
        ("tests", "integrate", "Cover priority risks"),
        ("verify", "integrate", "Run affected checks"),
        ("review", "code_review", "Review coverage gaps"),
    ],
    "timeboxed-discovery": [
        ("question", "plan", "Frame question"),
        ("investigate", "integrate", "Investigate sources"),
        ("compare", "integrate", "Compare alternatives"),
        ("recommend", "integrate", "Record recommendation"),
        ("review", "code_review", "Review decision"),
    ],
    "incident-response": [
        ("scope", "plan", "Assess incident and authorization"),
        ("stabilize", "integrate", "Prepare authorized mitigation"),
        ("correct", "integrate", "Verify durable correction"),
        ("review", "code_review", "Review causes and prevention"),
    ],
}


def built_in_profile(key):
    decision = key == "timeboxed-discovery"
    return {
        "schema_version": 1,
        "execution_mode": "decision" if decision else "code_change",
        "result_contract": 2,
        "stage_labels": {
            "plan": "Frame question",
            "integrate": "Investigate",
            "code_review": "Review decision",
            "final_approval": "Accept decision",
        }
        if decision
        else {},
        "steps": [
            {
                "id": step[0],
                "stage": step[1],
                "label": step[2],
                "conditional": len(step) > 3 and step[3],
            }
            for step in PROCEDURES[key]
        ],
    }


def validate_profile(profile):
    if not isinstance(profile, dict) or profile.get("schema_version") != 1:
        raise ValidationError("Unsupported workflow schema version.")
    if profile.get("execution_mode") not in SUPPORTED_MODES or profile.get("result_contract") != 2:
        raise ValidationError("This workflow execution version is not supported.")
    steps = profile.get("steps")
    if not isinstance(steps, list) or not steps or len(steps) > 40:
        raise ValidationError("The workflow needs a bounded set of steps.")
    ids = set()
    for step in steps:
        if (
            not isinstance(step, dict)
            or not isinstance(step.get("id"), str)
            or not step["id"]
            or step["id"] in ids
            or len(step["id"]) > 80
            or step.get("stage") not in {"plan", "integrate", "code_review"}
            or not isinstance(step.get("label"), str)
            or not step["label"].strip()
            or type(step.get("conditional")) is not bool
        ):
            raise ValidationError("The workflow contains an invalid or duplicate step.")
        ids.add(step["id"])
    return profile


def snapshot_for(work_type):
    work_type = type(work_type).objects.select_related("assigned_workflow").get(pk=work_type.pk)
    workflow = work_type.assigned_workflow
    profile = validate_profile(deepcopy(workflow.execution_profile))
    return {
        **profile,
        "key": workflow.key,
        "name": workflow.name,
        "definition_version": workflow.definition_version,
        "work_type": {"key": work_type.key, "name": work_type.name},
        "outputs": deepcopy(workflow.outputs),
        "validation": deepcopy(workflow.validation),
        "instructions": deepcopy(workflow.steps),
        "approval_points": deepcopy(workflow.approval_points),
    }


def workflow_snapshot(task):
    return task.workflow_snapshot or deepcopy(LEGACY_SNAPSHOT)
