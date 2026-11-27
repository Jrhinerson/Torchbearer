import pytest
from rest_framework.test import APIClient

from .models import AgentRun, Task
from .workspaces import ensure_workspace

pytestmark = pytest.mark.django_db


def test_unchanged_flow_skips_history_serialization_and_logs_invalidate_token(monkeypatch):
    task = Task.objects.create(title="Live log", status="plan")
    run = AgentRun.objects.create(
        task=task, sequence=1, stage="plan", agent="codex", state="running", log="first"
    )
    client = APIClient()
    path = f"/api/v1/tasks/{task.id}/flow/"
    first = client.get(path)
    etag = first["ETag"]
    assert first.status_code == 200
    from . import operations

    original = operations.flow

    def unexpected(*_):
        raise AssertionError("Unchanged flow must not load full history")

    monkeypatch.setattr(operations, "flow", unexpected)
    cached = client.get(path, HTTP_IF_NONE_MATCH=etag)
    assert cached.status_code == 304 and cached.content == b""
    assert client.get(path, HTTP_IF_NONE_MATCH="W/" + etag).status_code == 304
    monkeypatch.setattr(operations, "flow", original)
    AgentRun.objects.filter(pk=run.pk).update(log="other")
    changed = client.get(path, HTTP_IF_NONE_MATCH=etag)
    assert changed.status_code == 200 and changed["ETag"] != etag
    Task.objects.filter(pk=task.pk).update(revision=1)
    assert client.get(path, HTTP_IF_NONE_MATCH=changed["ETag"]).status_code == 200


def test_fingerprint_only_check_detects_external_edits_without_loading_diff(
    repository, settings, tmp_path, monkeypatch
):
    settings.DATA_DIR = tmp_path / "data"
    task = Task.objects.create(title="Detect edits", repository=repository)
    workspace = ensure_workspace(task)
    client = APIClient()
    path = f"/api/v1/tasks/{task.id}/workspace/?fingerprint=1"

    def unexpected(*_):
        raise AssertionError("Fingerprint checks must not generate diff previews")

    monkeypatch.setattr("tasks.views.changes", unexpected)
    before = client.get(path).json()
    assert set(before) == {"fingerprint"}
    (workspace / "README.md").write_text("An external edit\n", encoding="utf-8")
    after = client.get(path).json()
    assert after["fingerprint"] != before["fingerprint"]
