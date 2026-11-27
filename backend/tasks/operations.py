"""Read-only views of task ownership, attention, and recorded execution."""

from collections import Counter

from django.db.models import Prefetch, Q
from django.utils import timezone

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
    run = latest_run(task)
    agent = run.agent if run else owner_for(task, "plan")
    state = run.state if run else "ready"
    if task.completed_at:
        group, reason = "done", "Approved"
    elif run and state in {"queued", "running"}:
        group = "active"
        reason = "Stopping" if run.cancel_requested else state.title()
        if not worker["available"]:
            reason += " Â· worker offline"
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
    next_agent = owner_for(task, next_stage) if next_stage in Stage.values else None
    return {
        "group": group,
        "reason": reason,
        "state": "approved" if task.completed_at else state,
        "agent": agent,
        "next_agent": next_agent,
        "stage_label": STAGE_LABELS.get(task.status, "Backlog"),
        "workflow_name": "Legacy engineering workflow",
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
            add("refine", "Refine task", bool(task.repository))
        elif run:
            if run.state == "succeeded":
                action = "final_approve" if task.status == "final_approval" else "approve"
                add(action, projection(task, {"available": False})["reason"], fingerprint=True)
            else:
                add("retry", "Retry reply")
            if task.status == "plan":
                add("plan_message", "Send message")
            elif task.status in {"integrate", "code_review"}:
                add("revise", "Request revision")
            if task.status in {"integrate", "code_review", "final_approval"}:
                add("send_back", "Send back")
    elif run:
        add("retro", "Run retrospective")
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
        "tasks": cards,
        "counts": {group: counts[group] for group in GROUPS},
        "agents": agents,
        "worker": worker,
        "filters": filters,
        "observed_at": timezone.now(),
    }


def flow(task):
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
                "label": {
                    "plan": "Approve plan",
                    "integrate": "Approve validation",
                    "code_review": "Approve review",
                }[stage],
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
            "label": "Final approval",
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
    for decision in decisions:
        if decision.action == "send_back":
            edges.append(
                {
                    "source": decision.from_stage,
                    "target": decision.to_stage,
                    "kind": "rework",
                    "decision_id": decision.id,
                }
            )
    return {
        "task_id": str(task.id),
        "revision": task.revision,
        "latest_run_id": str(runs[0].id) if runs else None,
        "nodes": nodes,
        "edges": edges,
        "runs": RunSerializer(runs, many=True).data,
        "decisions": DecisionSerializer(decisions, many=True).data,
        "operations": projection(task, worker_status()),
        "actions": action_descriptors(task, runs[0] if runs else None),
    }

