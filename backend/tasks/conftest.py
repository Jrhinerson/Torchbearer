import pytest
from rest_framework.test import APIClient

from .git import git
from .models import Repository


@pytest.fixture
def local_client():
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def repository(tmp_path):
    path = tmp_path / "sample repository"
    path.mkdir()
    git(path, "init", "-b", "main")
    (path / "README.md").write_text("Example project\n", encoding="utf-8")
    git(path, "add", "README.md")
    git(
        path, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial"
    )
    return Repository.objects.create(path=str(path.resolve()), name=path.name)


def csrf(client):
    return {"HTTP_X_CSRFTOKEN": client.get("/api/v1/csrf/").json()["csrfToken"]}
