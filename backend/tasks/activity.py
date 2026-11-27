"""A bounded timeline of persisted lifecycle events and human decisions."""

from uuid import UUID

from django.core import signing
from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Cast
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from .models import AgentRun, Decision, Task
from .operations import filtered

CURSOR_SALT = "torchbearer.operations.activity.v1"


def activity(params):
    tasks, filters = filtered(Task.objects.all(), params)
    try:
        limit = int(params.get("limit", "30"))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError as error:
        raise ValidationError({"limit": "Choose a page size from 1 to 100."}) from error
    cutoff = timezone.now()
    before = None
    if params.get("cursor"):
        try:
            saved = signing.loads(params["cursor"], salt=CURSOR_SALT, max_age=3600)
            if saved["filters"] != filters:
                raise ValueError
            cutoff = parse_datetime(saved["cutoff"])
            before = (parse_datetime(saved["before"][0]), *saved["before"][1:])
            if (
                not cutoff
                or not before[0]
                or timezone.is_naive(cutoff)
                or timezone.is_naive(before[0])
            ):
                raise ValueError
        except (signing.BadSignature, ValueError, KeyError, TypeError) as error:
            raise ValidationError(
                {"cursor": "This activity cursor is invalid or expired. Reload activity."}
            ) from error

    def events(model, field, kind, action):
        decision = model is Decision
        queryset = (
            model.objects.filter(task_id__in=tasks.values("id"), **{f"{field}__isnull": False})
            .order_by()
            .annotate(
                event_time=F(field),
                event_kind=Value(kind),
                source_id=Cast("pk", CharField()),
                task_title=F("task__title"),
                actor=Value("human") if decision else F("agent"),
                source_run=Cast("run_id" if decision else "pk", CharField()),
                event_stage=F("from_stage" if decision else "stage"),
                event_action=action,
                event_revision=F("task_revision" if decision else "task__revision"),
            )
            .filter(event_time__lte=cutoff)
        )
        if before:
            timestamp, event_kind, source_id = before
            queryset = queryset.filter(
                Q(event_time__lt=timestamp)
                | Q(event_time=timestamp, event_kind__lt=event_kind)
                | Q(event_time=timestamp, event_kind=event_kind, source_id__lt=source_id)
            )
        return queryset.values(
            "event_time",
            "event_kind",
            "source_id",
            "task_id",
            "task_title",
            "actor",
            "source_run",
            "event_stage",
            "event_action",
            "event_revision",
        )

    combined = (
        events(AgentRun, "created_at", "queued", Value("queued"))
        .union(
            events(AgentRun, "started_at", "started", Value("started")),
            events(AgentRun, "finished_at", "finished", F("state")),
            events(Decision, "created_at", "decision", F("action")),
        )
        .order_by("-event_time", "-event_kind", "-source_id")
    )
    rows = list(combined[: limit + 1])
    cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        cursor = signing.dumps(
            {
                "cutoff": cutoff.isoformat(),
                "filters": filters,
                "before": [last["event_time"].isoformat(), last["event_kind"], last["source_id"]],
            },
            salt=CURSOR_SALT,
            compress=True,
        )
    return {
        "events": [
            {
                "id": f"{row['event_kind']}:{row['source_id']}",
                "created_at": row["event_time"],
                "kind": row["event_kind"],
                "task_id": row["task_id"],
                "task_title": row["task_title"],
                "actor": row["actor"],
                "run_id": str(UUID(row["source_run"])) if row["source_run"] else None,
                "stage": row["event_stage"],
                "action": row["event_action"],
                "revision": row["event_revision"],
            }
            for row in rows[:limit]
        ],
        "next_cursor": cursor,
        "filters": filters,
        "observed_at": cutoff,
    }
