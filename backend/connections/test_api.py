import json
import sys
import threading
import time
import uuid
from pathlib import Path

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from . import github as service_module
from . import views
from .github import GitHubService, StaleAuthorization, config_directory
from .models import GitHubConnection

pytestmark = pytest.mark.django_db


@pytest.fixture
def service(settings, tmp_path, monkeypatch):
    settings.DATA_DIR = tmp_path
    instance = GitHubService()
    monkeypatch.setattr(views, "github", instance)
    monkeypatch.setattr(
        service_module,
        "command",
        lambda: [sys.executable, str(Path(__file__).parent / "fixtures" / "fake_gh.py")],
    )
    yield instance
    instance.shutdown()


@pytest.fixture
def client():
    return APIClient(enforce_csrf_checks=True)


def write(client, method, name, data=None):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    return getattr(client, method)(reverse(name), data or {}, format="json", HTTP_X_CSRFTOKEN=token)


def start(client, service):
    response = write(client, "post", "github-connect")
    assert response.status_code == 200
    authorization = response.json()["authorization"]
    deadline = time.monotonic() + 10
    while not service.authorization.code and time.monotonic() < deadline:
        time.sleep(0.02)
    assert service.authorization.code == "ABCD-1234"
    return authorization["id"]


def approve(service, login="octocat", account_id=583231):
    authorization = service.authorization
    (config_directory(authorization.id) / "approved.json").write_text(
        json.dumps({"id": account_id, "login": login, "name": "The Octocat"}), encoding="utf-8"
    )
    assert authorization.finished.wait(timeout=10)


def poll(client, authorization_id):
    return write(client, "post", "github-poll", {"authorization_id": authorization_id})


def test_browser_authorization_verifies_and_persists_selected_account(client, service, monkeypatch):
    monkeypatch.setenv("GH_TOKEN", "unrelated-shell-token")
    monkeypatch.setenv("GITHUB_TOKEN", "unrelated-shell-token")
    monkeypatch.setenv("GH_ENTERPRISE_TOKEN", "unrelated-shell-token")
    monkeypatch.setenv("GH_CONFIG_DIR", "/do-not-use-shared-config")
    assert client.get(reverse("github-connection")).json()["account"] is None
    authorization_id = start(client, service)
    waiting = poll(client, authorization_id).json()
    assert waiting["account"] is None
    assert waiting["authorization"]["user_code"] == "ABCD-1234"
    assert waiting["authorization"]["verification_url"] == "https://github.com/login/device"
    assert GitHubConnection.objects.count() == 0

    approve(service)
    response = poll(client, authorization_id)
    assert response.status_code == 200
    assert response.json()["account"]["login"] == "octocat"
    assert response.json()["account"]["id"] == 583231
    assert response.json()["authorization"] is None
    connection = GitHubConnection.objects.get()
    assert str(connection.config_id) == authorization_id
    assert config_directory(connection.config_id).exists()
    assert "token" not in response.content.decode().lower()
    assert "config" not in response.content.decode().lower()
    assert response.headers["Cache-Control"] == "no-store"

    # A fresh backend service reads the durable connection without adopting another gh account.
    monkeypatch.setattr(views, "github", GitHubService())
    assert client.get(reverse("github-connection")).json()["account"] == response.json()["account"]


def test_duplicate_connect_reuses_pending_login(client, service):
    authorization_id = start(client, service)
    process = service.authorization.tree.process
    response = write(client, "post", "github-connect")
    assert response.json()["authorization"]["id"] == authorization_id
    assert service.authorization.tree.process is process


def test_cancel_stops_login_removes_config_and_rejects_late_poll(client, service):
    authorization_id = start(client, service)
    process = service.authorization.tree.process
    response = write(client, "post", "github-cancel", {"authorization_id": authorization_id})
    assert response.status_code == 200
    assert response.json()["authorization"] is None
    assert process.poll() is not None
    assert not config_directory(authorization_id).exists()
    assert poll(client, authorization_id).status_code == 409
    assert not GitHubConnection.objects.exists()


def test_expiry_stops_login_and_allows_new_attempt(client, service):
    authorization_id = start(client, service)
    process = service.authorization.tree.process
    service._expire(uuid.UUID(authorization_id))
    response = poll(client, authorization_id)
    assert response.json()["authorization"]["state"] == "expired"
    assert process.poll() is not None
    assert not config_directory(authorization_id).exists()
    assert start(client, service) != authorization_id
    # An expired timer cannot cancel a newer attempt.
    service._expire(uuid.UUID(authorization_id))
    assert service.authorization.state == "pending"


@pytest.mark.parametrize("failure", ["denied", "invalid", "bad_identity"])
def test_failed_account_change_preserves_connection_and_hides_cli_output(client, service, failure):
    first = start(client, service)
    approve(service)
    assert poll(client, first).json()["account"]["login"] == "octocat"
    second = start(client, service)
    directory = config_directory(second)
    if failure == "denied":
        (directory / "denied").touch()
        assert service.authorization.finished.wait(timeout=10)
    else:
        if failure == "invalid":
            (directory / "invalid").touch()
        approve(service, login="new-account", account_id=-1 if failure == "bad_identity" else 42)
    response = poll(client, second)
    assert response.json()["account"]["login"] == "octocat"
    assert response.json()["authorization"]["state"] == "failed"
    assert "secret-must-not-leak" not in response.content.decode()
    assert not directory.exists()
    assert config_directory(first).exists()


def test_successful_account_change_and_disconnect_remove_only_app_configuration(client, service):
    first = start(client, service)
    approve(service)
    poll(client, first)
    second = start(client, service)
    approve(service, login="chosen-account", account_id=42)
    assert poll(client, second).json()["account"]["login"] == "chosen-account"
    assert not config_directory(first).exists()
    # Disconnect must also stop a pending replacement, even if gh just succeeded.
    third = start(client, service)
    approve(service, login="too-late", account_id=43)
    response = write(client, "delete", "github-connection")
    assert response.json()["account"] is None
    assert response.json()["authorization"] is None
    assert not GitHubConnection.objects.exists()
    assert not config_directory(second).exists()
    assert not config_directory(third).exists()
    assert poll(client, third).status_code == 409


def test_missing_cli_has_actionable_error(client, service, monkeypatch):
    monkeypatch.setattr(service_module, "command", lambda: None)
    assert client.get(reverse("github-connection")).json()["available"] is False
    response = write(client, "post", "github-connect")
    assert response.status_code == 503
    assert "Install GitHub CLI" in response.json()["detail"]
    assert service.authorization is None


@pytest.mark.parametrize("action", ["cancel", "disconnect"])
def test_cancellation_during_identity_verification_prevents_late_connection(
    client, service, monkeypatch, action
):
    first = start(client, service)
    approve(service)
    poll(client, first)
    second = start(client, service)
    approve(service, login="too-late", account_id=42)
    verifying = threading.Event()
    release = threading.Event()
    errors = []

    def delayed_profile(config_id):
        verifying.set()
        assert release.wait(timeout=10)
        return {"login": "too-late", "account_id": 42, "name": ""}

    def background_poll():
        try:
            service.poll(second)
        except StaleAuthorization as error:
            errors.append(error)

    monkeypatch.setattr(service_module, "profile", delayed_profile)
    thread = threading.Thread(target=background_poll)
    thread.start()
    try:
        assert verifying.wait(timeout=10)
        # Duplicate polls leave the same verification in progress.
        assert poll(client, second).json()["authorization"]["state"] == "pending"
        if action == "cancel":
            response = write(client, "post", "github-cancel", {"authorization_id": second})
        else:
            response = write(client, "delete", "github-connection")
        assert response.status_code == 200
    finally:
        release.set()
        thread.join(timeout=10)
    assert not thread.is_alive()
    assert len(errors) == 1
    if action == "cancel":
        assert GitHubConnection.objects.get().login == "octocat"
    else:
        assert not GitHubConnection.objects.exists()
    assert not config_directory(second).exists()


def test_cli_launch_failure_is_recoverable(client, service, monkeypatch):
    def fail_to_start(*args, **kwargs):
        raise OSError("Could not start the process")

    monkeypatch.setattr(service_module, "ProcessTree", fail_to_start)
    response = write(client, "post", "github-connect")
    assert response.status_code == 503
    assert service.authorization is None
    assert not list((service_module.settings.DATA_DIR / "github").iterdir())


@pytest.mark.parametrize(
    ("method", "name"),
    [
        ("post", "github-connect"),
        ("post", "github-poll"),
        ("post", "github-cancel"),
        ("delete", "github-connection"),
    ],
)
def test_connection_mutations_require_csrf(client, service, method, name):
    response = getattr(client, method)(reverse(name), {}, format="json")
    assert response.status_code == 403
    assert service.authorization is None


def test_rejects_malformed_or_stale_attempts_and_get_cannot_start_login(client, service):
    assert write(client, "post", "github-poll", {"authorization_id": "../path"}).status_code == 400
    assert poll(client, str(uuid.uuid4())).status_code == 409
    assert client.get(reverse("github-connect")).status_code == 405
    assert service.authorization is None
