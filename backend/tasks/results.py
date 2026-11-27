"""Versioned, bounded evidence added to the existing agent result envelope."""

from copy import deepcopy

STEP_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "step_id": {"type": "string"},
        "outcome": {
            "type": "string",
            "enum": ["complete", "blocked", "failed", "not_run", "not_applicable"],
        },
        "summary": {"type": "string"},
        "test_indexes": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["step_id", "outcome", "summary", "test_indexes"],
}
DECISION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "question": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"summary": {"type": "string"}, "source": {"type": "string"}},
                "required": ["summary", "source"],
            },
        },
        "options": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"name": {"type": "string"}, "tradeoffs": {"type": "string"}},
                "required": ["name", "tradeoffs"],
            },
        },
        "recommendation": {"type": "string"},
        "limitations": {"type": "string"},
    },
    "required": ["question", "findings", "options", "recommendation", "limitations"],
}


def profiled(workflow):
    return bool(workflow and workflow.get("execution_mode") != "legacy")


def result_schema(base, workflow=None):
    schema = deepcopy(base)
    if profiled(workflow):
        schema["properties"]["workflow_steps"] = {"type": "array", "items": deepcopy(STEP_SCHEMA)}
        schema["properties"]["artifacts"] = {
            "type": "object",
            "additionalProperties": False,
            "properties": {"decision": {"anyOf": [deepcopy(DECISION_SCHEMA), {"type": "null"}]}},
            "required": ["decision"],
        }
        schema["required"].extend(["workflow_steps", "artifacts"])
    return schema


def bounded_text(value, limit=8000):
    return isinstance(value, str) and bool(value.strip()) and len(value) <= limit


def validate_workflow_report(result, stage, workflow):
    steps = {step["id"]: step for step in workflow["steps"] if step["stage"] == stage}
    reports = result["workflow_steps"]
    if not isinstance(reports, list) or len(reports) > 40:
        raise ValueError("Invalid workflow step report.")
    reported = set()
    for report in reports:
        if not isinstance(report, dict) or set(report) != {
            "step_id",
            "outcome",
            "summary",
            "test_indexes",
        }:
            raise ValueError("Invalid workflow step report fields.")
        key = report["step_id"]
        if not isinstance(key, str) or key not in steps or key in reported:
            raise ValueError("Unknown, duplicate, or wrong-stage workflow step.")
        reported.add(key)
        outcome = report["outcome"]
        if (
            not isinstance(outcome, str)
            or outcome
            not in {
                "complete",
                "blocked",
                "failed",
                "not_run",
                "not_applicable",
            }
            or not bounded_text(report["summary"], 4000)
        ):
            raise ValueError("Invalid workflow step outcome or explanation.")
        if outcome == "not_applicable" and not steps[key]["conditional"]:
            raise ValueError("A required workflow step cannot be marked not applicable.")
        indexes = report["test_indexes"]
        if (
            not isinstance(indexes, list)
            or len(indexes) > 100
            or any(
                type(index) is not int or not 0 <= index < len(result["tests"]) for index in indexes
            )
        ):
            raise ValueError("Workflow evidence refers to an invalid command report.")
        if result["outcome"] == "complete" and outcome not in {"complete", "not_applicable"}:
            raise ValueError("A successful stage needs complete workflow evidence.")
    if result["outcome"] == "complete" and reported != set(steps):
        raise ValueError("A successful stage must report every workflow step in its stage.")
    artifacts = result["artifacts"]
    if not isinstance(artifacts, dict) or set(artifacts) != {"decision"}:
        raise ValueError("Invalid workflow artifacts.")
    decision = artifacts["decision"]
    required = (
        workflow["execution_mode"] == "decision"
        and stage == "integrate"
        and result["outcome"] == "complete"
    )
    if required and decision is None:
        raise ValueError("Discovery needs a reviewed decision artifact.")
    if decision is not None:
        if workflow["execution_mode"] != "decision" or stage != "integrate":
            raise ValueError("This stage does not produce a decision artifact.")
        if not isinstance(decision, dict) or set(decision) != set(DECISION_SCHEMA["required"]):
            raise ValueError("The decision artifact is incomplete.")
        if any(
            not bounded_text(decision[key]) for key in ("question", "recommendation", "limitations")
        ):
            raise ValueError("The decision needs its question, recommendation, and limitations.")
        for key, fields, minimum in [
            ("findings", {"summary", "source"}, 1),
            ("options", {"name", "tradeoffs"}, 2),
        ]:
            entries = decision[key]
            if not isinstance(entries, list) or not minimum <= len(entries) <= 30:
                raise ValueError("The decision needs evidence and a comparison of alternatives.")
            for entry in entries:
                if (
                    not isinstance(entry, dict)
                    or set(entry) != fields
                    or any(not bounded_text(entry[field]) for field in fields)
                ):
                    raise ValueError("The decision contains an invalid evidence or option entry.")
