from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AgentRun, Decision, Task

pytestmark = pytest.mark.django_db


def test_activity_pagination_is_stable_for_tied_timestamps(django_assert_num_queries):
    task = Task.objects.create(title="Alpha")
    timestamp = timezone.now() - timedelta(minutes=1)
    run = AgentRun.objects.create(
        task=task, stage="plan", agent="codex", sequence=1, state="succeeded"
    )
    AgentRun.objects.filter(pk=run.pk).update(
        created_at=timestamp, started_at=timestamp, finished_at=timestamp
    )
    decision = Decision.objects.create(
        task=task,
        run=run,
        action="approve",
        from_stage="plan",
        to_stage="integrate",
        task_revision=4,
    )
    Decision.objects.filter(pk=decision.pk).update(created_at=timestamp)
    client = APIClient()
    with django_assert_num_queries(1):
        first = client.get("/api/v1/operations/activity/?limit=2&q=Alpha").json()
    assert len(first["events"]) == 2 and first["next_cursor"]
    AgentRun.objects.create(task=task, stage="integrate", agent="pi", sequence=2)
    second = client.get(
        "/api/v1/operations/activity/", {"limit": 2, "q": "Alpha", "cursor": first["next_cursor"]}
    ).json()
    assert len(second["events"]) == 2 and second["next_cursor"] is None
    events = first["events"] + second["events"]
    assert len({event["id"] for event in events}) == 4
    assert {event["kind"] for event in events} == {"queued", "started", "finished", "decision"}
    assert all(event["task_id"] == str(task.id) for event in events)
    assert next(event for event in events if event["kind"] == "decision")["revision"] == 4
    assert (
        client.get(
            "/api/v1/operations/activity/", {"cursor": first["next_cursor"], "q": "Other"}
        ).status_code
        == 400
    )


def test_activity_filters_limits_and_invalid_cursors():
    task = Task.objects.create(title="Selected")
    other = Task.objects.create(title="Other")
    for current in [task, other]:
        AgentRun.objects.create(task=current, stage="refine", agent="claude", sequence=1)
    client = APIClient()
    data = client.get("/api/v1/operations/activity/?q=Selected&project=none").json()
    assert len(data["events"]) == 1 and data["events"][0]["task_title"] == "Selected"
    assert "log" not in data["events"][0]
    for query in ["cursor=bad", "limit=0", "limit=101", "limit=invalid", "project=invalid"]:
        assert client.get(f"/api/v1/operations/activity/?{query}").status_code == 400
