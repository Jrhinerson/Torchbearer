"""Deterministic fictional records; never run against the normal application data."""

from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

from django.conf import settings
from django.core.management.base import CommandError
from django.db import transaction
from projects.models import Project
from workflows.models import WorkType
from workflows.profiles import snapshot_for

from .models import AgentRun, Decision, Repository, Task
from .routing import agent_for

TITLES = [
    "Add team audit exports",
    "Improve keyboard navigation",
    "Compare search backends",
    "Document retry semantics",
    "Map tenancy boundaries",
    "Add invoice preview",
    "Upgrade OpenAPI client",
    "Reduce report query time",
    "Review role permissions",
    "Clarify export retention",
    "Add trace correlation IDs",
    "Define event retention",
    "Harden Redis reconnects",
    "Benchmark queue throughput",
    "Prototype dead-letter tooling",
    "Review delivery guarantees",
    "Add accessible table sorting",
    "Measure cache hit ratio",
    "Validate subscription boundaries",
    "Fix duplicate webhook deliveries",
    "Choose queue backend",
    "Resolve concurrent invoice updates",
    "Clarify large-export timeout policy",
    "Recover interrupted dependency upgrade",
    "Review cancelled migration rehearsal",
    "Check screen-reader announcements",
    "Confirm tenant isolation rules",
    "Review import schema compatibility",
    "Approve search relevance changes",
    "Review workflow result evidence",
    "Restore CSV date formatting",
    "Fix mobile dialog overflow",
    "Accept cache invalidation strategy",
    "Document worker recovery",
    "Fix retry jitter",
    "Validate pagination cursors",
    "Add request tracing",
    "Review webhook authorization",
    "Simplify report formatting",
    "Verify timezone conversion",
]


def demo_id(key):
    return uuid5(NAMESPACE_URL, f"torchbearer-demo/{key}")


@transaction.atomic
def seed_demo():
    if not settings.DEMO_MODE or settings.DATA_DIR == (settings.PROJECT_DIR / ".local").resolve():
        raise CommandError("Demo seeding requires demo mode and an isolated data directory.")
    if Task.objects.exists() or Project.objects.exists() or Repository.objects.exists():
        raise CommandError(
            "Demo seeding only accepts an empty database; existing data is preserved."
        )
    projects = []
    for name in ["Atlas API", "Ledger", "Harbor", "Torchbearer"]:
        path = str(settings.DATA_DIR / "fictional-projects" / name)
        projects.append(
            (
                Project.objects.create(id=demo_id(name), name=name, path=path),
                Repository.objects.create(name=name, path=path),
            )
        )
    types = list(WorkType.objects.order_by("key"))
    clock = datetime(2026, 11, 27, 10, 42, tzinfo=UTC)
    for index, title in enumerate(TITLES):
        project, repository = projects[index % 4]
        work_type = (
            WorkType.objects.get(pk="bug" if index == 19 else "research")
            if index in {19, 20}
            else types[index % len(types)]
        )
        stage = (
            "backlog"
            if index < 12
            else "integrate"
            if index < 19
            else "plan"
            if index in {22, 23, 24}
            else "integrate"
            if index < 30
            else "final_approval"
        )
        task = Task.objects.create(
            id=demo_id(title),
            title=title,
            description=(
                "Fictional acceptance fixture. Review the recorded procedure, "
                "evidence, and human handoffs."
            ),
            project=project,
            repository=repository,
            work_type=work_type,
            workflow_snapshot=snapshot_for(work_type),
            routing_mode="hybrid",
            status=stage,
            revision=3,
            completed_at=clock if index >= 30 else None,
        )
        stamp = clock - timedelta(minutes=index)
        Task.objects.filter(pk=task.pk).update(created_at=stamp, updated_at=stamp)
        if stage == "backlog":
            continue
        task.workspace_path = str(settings.DATA_DIR / "workspaces" / str(task.id))
        task.save(update_fields=["workspace_path"])
        stages = (
            ["plan", "integrate", "code_review"]
            if index >= 30
            else ["plan"]
            if stage == "plan"
            else ["plan", "integrate"]
        )
        for sequence, run_stage in enumerate(stages, 1):
            last = sequence == len(stages)
            state = "succeeded"
            if last and index < 19:
                state = "running" if index == 12 else "queued"
            elif last and 21 <= index <= 24:
                state = ["failed", "blocked", "interrupted", "cancelled"][index - 21]
            result = {
                "outcome": "complete"
                if state == "succeeded"
                else "blocked"
                if state == "blocked"
                else "failed",
                "summary": f"Demo: {run_stage.replace('_', ' ')} evidence",
                "details": "Which retention window should apply to exports?"
                if state == "blocked"
                else "Fictional recorded evidence for layout and recovery testing.",
                "tests": [
                    {
                        "command": "pytest tests/webhooks -q",
                        "outcome": "pass",
                        "details": "Demo evidence: 28 passed",
                    }
                ]
                if run_stage == "integrate"
                and task.workflow_snapshot["execution_mode"] != "decision"
                else [],
                "workflow_steps": [
                    {
                        "step_id": step["id"],
                        "outcome": "complete" if state == "succeeded" else "not_run",
                        "summary": "Fictional procedure evidence",
                        "test_indexes": [],
                    }
                    for step in task.workflow_snapshot["steps"]
                    if step["stage"] == run_stage
                ],
                "artifacts": {"decision": None},
            }
            if task.workflow_snapshot["execution_mode"] == "decision" and run_stage == "integrate":
                result["artifacts"]["decision"] = {
                    "question": "Which queue should power local-first background jobs?",
                    "findings": [
                        {
                            "summary": "Jobs must survive worker restarts.",
                            "source": "Harbor/docs/queue-requirements.md",
                        }
                    ],
                    "options": [
                        {
                            "name": "SQLite queue",
                            "tradeoffs": "Simple operations; single-machine scope.",
                        },
                        {"name": "Redis Streams", "tradeoffs": "Multiple workers; adds a service."},
                    ],
                    "recommendation": "Use SQLite for v1; revisit Redis for multiple worker hosts.",
                    "limitations": "Synthetic workload; production-like measurement is required.",
                }
            run = AgentRun.objects.create(
                id=demo_id(f"{title}/{sequence}"),
                task=task,
                sequence=sequence,
                stage=run_stage,
                agent=agent_for(task, run_stage),
                state=state,
                result=result if state not in {"running", "queued"} else {},
                error="Demo failure: concurrent replay was not handled."
                if state == "failed"
                else "",
                review_fingerprint="demo-" + task.id.hex,
                input_context={"workflow": task.workflow_snapshot},
                log="Demo log: fictional fixture, no CLI was executed.",
            )
            AgentRun.objects.filter(pk=run.pk).update(
                created_at=stamp,
                started_at=stamp if state != "queued" else None,
                finished_at=stamp if state not in {"running", "queued"} else None,
            )
            if not last or index >= 30:
                Decision.objects.create(
                    task=task,
                    run=run,
                    action="final_approve" if last else "approve",
                    from_stage=run_stage,
                    to_stage="final_approval" if last else stages[sequence],
                    task_revision=2,
                    review_fingerprint=run.review_fingerprint,
                    feedback="Demo human approval",
                )


def workspace_preview(task):
    run = task.runs.first()
    return {
        "diff": ""
        if task.workflow_snapshot.get("execution_mode") == "decision"
        else (
            "# Fictional demo change; no workspace was executed\n"
            "+ if event_id not in deliveries:\n+     enqueue(event_id)\n"
        ),
        "fingerprint": run.review_fingerprint if run else "",
        "truncated": False,
    }
