import pytest
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from .demo import demo_id, seed_demo
from .models import Task
from .test_task_workflows import profiles as profiles
from .worker import Worker

pytestmark = pytest.mark.django_db


def test_demo_requires_isolation_and_preserves_existing_data(profiles, settings, tmp_path):
    with pytest.raises(CommandError, match="isolated"):
        seed_demo()
    settings.DEMO_MODE = True
    settings.DATA_DIR = tmp_path
    Task.objects.create(title="Keep my task")
    with pytest.raises(CommandError, match="empty"):
        seed_demo()
    assert list(Task.objects.values_list("title", flat=True)) == ["Keep my task"]


def test_demo_renders_mixed_evidence_but_blocks_all_writes_and_workers(
    profiles, settings, tmp_path
):
    settings.DEMO_MODE = True
    settings.DATA_DIR = tmp_path
    seed_demo()
    client = APIClient()
    data = client.get("/api/v1/operations/").json()
    assert data["read_only"] and len(data["tasks"]) == 40
    assert all(data["counts"].values())
    task_id = demo_id("Choose queue backend")
    flow = client.get(f"/api/v1/tasks/{task_id}/flow/").json()
    assert flow["read_only"]
    assert flow["runs"][0]["result"]["artifacts"]["decision"]["options"]
    assert client.get(f"/api/v1/tasks/{task_id}/workspace/").json()["diff"] == ""
    for path in ["tasks/", f"tasks/{task_id}/actions/", "projects/", "connections/github/device/"]:
        assert client.post(f"/api/v1/{path}", {}, format="json").status_code == 403
    assert client.delete(f"/api/v1/tasks/{task_id}/").status_code == 403
    assert Task.objects.count() == 40
    with pytest.raises(RuntimeError, match="disabled"):
        Worker()
