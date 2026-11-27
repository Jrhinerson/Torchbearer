"""Read-only views of task ownership, attention, and recorded execution."""

import hashlib
import json
from collections import Counter

from django.conf import settings
from django.db.models import Prefetch, Q
from django.utils import timezone
from workflows.profiles import workflow_snapshot

from .cli import agent_catalog
from .models import AgentRun, Task
from .routing import NEXT_STAGE, Stage, agent_for
from .serializers import DecisionSerializer, RunSerializer, TaskSerializer
from .worker import worker_status

STAGE_LABELS = {
    "plan": "Plan",
    "integrate": "Integrate",
    "code_review": "Code review",
    "final_approval": "Final approval",
    "refine": "Refinement",
    "retro": "Retrospective",
}
GROUPS = ("backlog", "active", "needs_you", "done")


def task_queryset():
    return Task.objects.select_related("project").prefetch_related(
        Prefetch(
            "runs",
            queryset=AgentRun.objects.only(
                "task_id", "stage", "agent", "state", "sequence", "error", "cancel_requested"
            ).order_by("-sequence")[:1],
            to_attr="operation_runs",
        )
    )


def filtered(queryset, params):
    project = params.get("project", "").strip()
    query = params.get("q", "").strip()[:200]
    if project == "none":
        queryset = queryset.filter(project__isnull=True)
    elif project:
        from uuid import UUID

        from rest_framework.exceptions import ValidationError

        try:
            UUID(project)
        except ValueError as error:
            raise ValidationError({"project": "Choose a valid project."}) from error
        queryset = queryset.filter(project_id=project)
    if query:
        queryset = queryset.filter(Q(title__icontains=query) | Q(description__icontains=query))
    return queryset, {"project": project, "q": query}


def latest_run(task):
    if hasattr(task, "operation_runs"):
        return next(iter(task.operation_runs), None)
    return task.runs.first()


def owner_for(task, stage):
    try:
        return agent_for(task, stage)
    except ValueError:
        return None


def projection(task, worker):
    snapshot = workflow_snapshot(task)
    run = latest_run(task)
    applicable = run and (
        run.stage == task.status
        or (task.status == "backlog" and run.stage == "refine")
        or task.status == "final_approval"
    )
    agent = (
        run.agent
        if applicable
        else owner_for(task, task.status if task.status in Stage.values else "plan")
    )
    state = run.state if run else "ready"
    if task.completed_at:
        group, reason = "done", "Approved"
    elif run and state in {"queued", "running"}:
        group = "active"
        reason = "Stopping" if run.cancel_requested else state.title()
        if not worker["available"]:
            reason += " · worker offline"
    elif task.routing_mode is None:
        group, reason = "needs_you", "Choose routing"
    elif task.status == "final_approval":
        group, reason = "needs_you", "Give final approval"
    elif run:
        group = "needs_you"
        if state == "succeeded":
            reason = {
                "plan": "Approve plan",
                "integrate": "Approve validation",
                "code_review": "Approve review",
                "refine": "Review refinement",
            }.get(run.stage, "Review result")
        else:
            reason = {
                "blocked": "Answer or resolve blocker",
                "failed": "Review failure",
                "cancelled": "Retry or revise",
                "interrupted": "Review interrupted work",
            }.get(state, "Review task")
    elif task.status == "backlog":
        group, reason = "backlog", "Ready"
    else:
        group, reason = "needs_you", "Review missing execution history"
    next_stage = NEXT_STAGE.get(task.status)
    if (
        snapshot.get("execution_mode") == "decision"
        and group == "needs_you"
        and (task.status == "final_approval" or (run and run.state == "succeeded"))
    ):
        reason = {
            "plan": "Approve investigation plan",
            "integrate": "Approve findings",
            "code_review": "Approve decision review",
            "final_approval": "Accept decision",
        }.get(task.status, reason)
    next_agent = owner_for(task, next_stage) if next_stage in Stage.values else None
    return {
        "group": group,
        "reason": reason,
        "state": "approved" if task.completed_at else state,
        "agent": agent,
        "next_agent": next_agent,
        "stage_label": snapshot.get("stage_labels", {}).get(
            task.status, STAGE_LABELS.get(task.status, "Backlog")
        ),
        "workflow_name": snapshot["name"],
        "running": bool(
            run
            and state == "running"
            and worker["available"]
            and str(worker["active_run"]) == str(run.id)
        ),
    }


def action_descriptors(task, run):
    active = bool(run and run.state in {"queued", "running"})
    actions = []

    def add(action, label, enabled=True, reason="", fingerprint=False):
        actions.append(
            {
                "action": action,
                "label": label,
                "enabled": enabled,
                "reason": reason,
                "requires_fingerprint": fingerprint,
            }
        )

    if active:
        add(
            "cancel",
            "Stop reply",
            not run.cancel_requested,
            "Stop already requested" if run.cancel_requested else "",
        )
    elif not task.completed_at:
        if task.routing_mode is None:
            add("settings", "Choose routing")
        elif task.status == "backlog":
            add(
                "start",
                "Start planning",
                bool(task.repository),
                "Choose a Git project" if not task.repository else "",
                bool(run),
            )
            add(
                "refine",
                "Answer question"
                if run and run.state == "blocked"
                else "Continue refinement"
                if run and run.state == "succeeded"
                else "Retry refinement"
                if run
                else "Refine task",
                bool(task.repository),
            )
        elif run:
            if run.state == "succeeded":
                action = "final_approve" if task.status == "final_approval" else "approve"
                add(action, projection(task, {"available": False})["reason"], fingerprint=True)
            elif task.status in Stage.values:
                add("retry", "Retry reply")
            if task.status == "plan":
                add("plan_message", "Answer question" if run.state == "blocked" else "Send message")
            elif task.status in {"integrate", "code_review"}:
                add("revise", "Request revision")
            if task.status in {"integrate", "code_review", "final_approval"}:
                add("send_back", "Send back")
    elif run:
        add(
            "retro",
            "Retry retrospective"
            if run.stage == "retro" and run.state != "succeeded"
            else "Run retrospective",
        )
    return actions


def overview(params):
    queryset, filters = filtered(task_queryset(), params)
    tasks = list(queryset)
    worker = worker_status()
    cards = [
        {**TaskSerializer(task).data, "operations": projection(task, worker)} for task in tasks
    ]
    counts = Counter(card["operations"]["group"] for card in cards)
    agents = agent_catalog()
    for agent in agents:
        runs = [latest_run(task) for task in tasks]
        agent["queued"] = sum(
            bool(run and run.agent == agent["id"] and run.state == "queued") for run in runs
        )
        agent["running"] = sum(
            bool(
                run
                and run.agent == agent["id"]
                and run.state == "running"
                and worker["available"]
                and str(worker["active_run"]) == str(run.id)
            )
            for run in runs
        )
    return {
        **({"read_only": True} if settings.DEMO_MODE else {}),
        "tasks": cards,
        "counts": {group: counts[group] for group in GROUPS},
        "agents": agents,
        "worker": worker,
        "filters": filters,
        "observed_at": timezone.now(),
    }


def flow(task):
    snapshot = workflow_snapshot(task)
    runs = list(task.runs.all())
    decisions = list(task.decisions.all())
    nodes, edges = [], []
    cutoff = 0
    for stage in Stage.values:
        run = next((run for run in runs if run.stage == stage and run.sequence > cutoff), None)
        if run:
            cutoff = run.sequence
        accepted = bool(
            run
            and any(
                decision.action == "approve" and decision.run_id == run.id for decision in decisions
            )
        )
        procedures = [step for step in snapshot.get("steps", []) if step["stage"] == stage]
        reports = (
            {report["step_id"]: report for report in run.result.get("workflow_steps", [])}
            if run
            else {}
        )
        if procedures:
            for step in procedures:
                report = reports.get(step["id"])
                nodes.append(
                    {
                        "id": step["id"],
                        "label": step["label"],
                        "kind": "procedure",
                        "stage": stage,
                        "agent": run.agent if run else owner_for(task, stage),
                        "state": (
                            "succeeded" if report["outcome"] == "complete" else report["outcome"]
                        )
                        if report
                        else ("not_reported" if run else "planned"),
                        "accepted": accepted,
                        "run_id": str(run.id) if run else None,
                        "evidence": report,
                    }
                )
        else:
            nodes.append(
                {
                    "id": stage,
                    "label": STAGE_LABELS[stage],
                    "kind": "stage",
                    "agent": run.agent if run else owner_for(task, stage),
                    "state": run.state if run else "planned",
                    "accepted": accepted,
                    "run_id": str(run.id) if run else None,
                }
            )
        nodes.append(
            {
                "id": f"approve_{stage}",
                "label": (
                    {
                        "plan": "Approve investigation plan",
                        "integrate": "Approve findings",
                        "code_review": "Approve decision review",
                    }
                    if snapshot.get("execution_mode") == "decision"
                    else {
                        "plan": "Approve plan",
                        "integrate": "Approve validation",
                        "code_review": "Approve review",
                    }
                )[stage],
                "kind": "gate",
                "agent": "human",
                "state": "accepted"
                if accepted
                else (
                    "waiting"
                    if run and run.state == "succeeded" and task.status == stage
                    else "planned"
                ),
                "run_id": str(run.id) if run else None,
            }
        )
    nodes.append(
        {
            "id": "final_approval",
            "label": snapshot.get("stage_labels", {}).get("final_approval", "Final approval"),
            "kind": "gate",
            "agent": "human",
            "state": "accepted"
            if task.completed_at
            else ("waiting" if task.status == "final_approval" else "planned"),
            "run_id": str(runs[0].id) if runs else None,
        }
    )
    for source, target in zip(nodes, nodes[1:], strict=False):
        edges.append({"source": source["id"], "target": target["id"], "kind": "forward"})
    work_nodes = [node for node in nodes if node.get("stage", node["id"]) == "integrate"]
    review_nodes = [node for node in nodes if node.get("stage", node["id"]) == "code_review"]
    if work_nodes and review_nodes:
        edges.append(
            {
                "source": review_nodes[-1]["id"],
                "target": work_nodes[0]["id"],
                "kind": "possible_rework",
            }
        )
    for decision in decisions:
        if decision.action == "send_back":
            edges.append(
                {
                    "source": next(
                        (
                            node["id"]
                            for node in reversed(nodes)
                            if node.get("stage", node["id"]) == decision.from_stage
                        ),
                        decision.from_stage,
                    ),
                    "target": next(
                        (
                            node["id"]
                            for node in nodes
                            if node.get("stage", node["id"]) == decision.to_stage
                        ),
                        decision.to_stage,
                    ),
                    "kind": "rework",
                    "decision_id": decision.id,
                }
            )
    operation_state = projection(task, worker_status())
    return {
        **({"read_only": True} if settings.DEMO_MODE else {}),
        "task": {**TaskSerializer(task).data, "operations": operation_state},
        "task_id": str(task.id),
        "revision": task.revision,
        "latest_run_id": str(runs[0].id) if runs else None,
        "nodes": nodes,
        "edges": edges,
        "runs": RunSerializer(runs, many=True).data,
        "decisions": DecisionSerializer(decisions, many=True).data,
        "operations": operation_state,
        "workflow": snapshot,
        "actions": action_descriptors(task, runs[0] if runs else None),
    }


def flow_etag(task):
    """History mutations bump task revision; live logs need their own content digest.

    Read only the bounded latest log, not every historical result, context and log.
    Heartbeat timestamps are excluded so an idle worker does not invalidate a view.
    """
    run = task.runs.only(
        "task_id",
        "stage",
        "agent",
        "state",
        "sequence",
        "error",
        "cancel_requested",
        "log",
        "cli_version",
        "started_at",
        "finished_at",
    ).first()
    task.operation_runs = [run] if run else []
    worker = worker_status()
    payload = {
        "task": TaskSerializer(task).data,
        "log": run.log if run else "",
        "version": run.cli_version if run else "",
        "started": run.started_at if run else None,
        "finished": run.finished_at if run else None,
        "worker": [worker["available"], str(worker["active_run"])],
        "read_only": settings.DEMO_MODE,
    }
    return (
        '"'
        + hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
        + '"'
    )
