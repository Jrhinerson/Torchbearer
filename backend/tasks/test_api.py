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
