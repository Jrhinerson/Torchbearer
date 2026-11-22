import uuid

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Task


@pytest.fixture
def client():
    return APIClient(enforce_csrf_checks=True)


def csrf_headers(client):
    response = client.get(reverse("csrf-token"))
    return {"HTTP_X_CSRFTOKEN": response.json()["csrfToken"]}


def test_health(client):
    response = client.get(reverse("health"))
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.django_db
def test_create_and_list_task(client):
    response = client.post(
        reverse("task-list"),
        {"title": "Write acceptance criteria", "description": "Define what success looks like."},
        format="json",
        **csrf_headers(client),
    )
    assert response.status_code == 201
    task = Task.objects.get(id=response.json()["id"])
    assert task.status == Task.Status.BACKLOG
    assert task.description == "Define what success looks like."
    assert client.get(reverse("task-list")).json()[0]["id"] == str(task.id)


@pytest.mark.django_db
def test_anonymous_write_requires_csrf(client):
    response = client.post(reverse("task-list"), {"title": "Unverified"}, format="json")
    assert response.status_code == 403
    assert Task.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_invalid_title_is_not_saved(client, title):
    response = client.post(
        reverse("task-list"), {"title": title}, format="json", **csrf_headers(client)
    )
    assert response.status_code == 400
    assert "title" in response.json()
    assert Task.objects.count() == 0


@pytest.mark.django_db
def test_cannot_assign_workflow_status(client):
    response = client.post(
        reverse("task-list"),
        {"title": "Skip approval", "status": "done"},
        format="json",
        **csrf_headers(client),
    )
    assert response.status_code == 400
    assert "status" in response.json()
    assert Task.objects.count() == 0


@pytest.mark.django_db
def test_wrong_csrf_token_is_rejected(client):
    csrf_headers(client)
    response = client.post(
        reverse("task-list"),
        {"title": "Unverified token"},
        format="json",
        HTTP_X_CSRFTOKEN="a" * 64,
    )
    assert response.status_code == 403
    assert Task.objects.count() == 0


@pytest.mark.django_db
def test_untrusted_origin_is_rejected_even_with_valid_token(client):
    response = client.post(
        reverse("task-list"),
        {"title": "Untrusted origin"},
        format="json",
        HTTP_ORIGIN="https://untrusted.example",
        **csrf_headers(client),
    )
    assert response.status_code == 403
    assert Task.objects.count() == 0


@pytest.mark.django_db
def test_new_client_can_read_saved_task(client):
    response = client.post(
        reverse("task-list"),
        {"title": "Persist across requests"},
        format="json",
        **csrf_headers(client),
    )
    assert response.status_code == 201
    separate_client = APIClient()
    assert separate_client.get(reverse("task-list")).json()[0]["id"] == response.json()["id"]


@pytest.mark.django_db
def test_delete_removes_only_the_selected_task(client):
    task = Task.objects.create(title="Remove this task")
    other_task = Task.objects.create(title="Keep this task")
    response = client.delete(reverse("task-detail", kwargs={"pk": task.id}), **csrf_headers(client))
    assert response.status_code == 204
    assert response.content == b""
    assert not Task.objects.filter(id=task.id).exists()
    assert Task.objects.filter(id=other_task.id).exists()
    assert [item["id"] for item in client.get(reverse("task-list")).json()] == [str(other_task.id)]


@pytest.mark.django_db
@pytest.mark.parametrize("verification", ["missing", "invalid-token", "untrusted-origin"])
def test_unverified_delete_preserves_the_task(client, verification):
    task = Task.objects.create(title="Keep unverified requests out")
    headers = {} if verification == "missing" else csrf_headers(client)
    if verification == "invalid-token":
        headers["HTTP_X_CSRFTOKEN"] = "a" * 64
    elif verification == "untrusted-origin":
        headers["HTTP_ORIGIN"] = "https://untrusted.example"
    response = client.delete(reverse("task-detail", kwargs={"pk": task.id}), **headers)
    assert response.status_code == 403
    assert Task.objects.filter(id=task.id).exists()


@pytest.mark.django_db
def test_delete_missing_task_returns_not_found(client):
    task = Task.objects.create(title="Keep existing tasks")
    response = client.delete(
        reverse("task-detail", kwargs={"pk": uuid.uuid4()}), **csrf_headers(client)
    )
    assert response.status_code == 404
    assert Task.objects.filter(id=task.id).exists()
