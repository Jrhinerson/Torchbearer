import json
import threading
import uuid

import pytest
from django.db import DatabaseError, close_old_connections
from django.urls import reverse
from rest_framework.test import APIClient

from . import views
from .credentials import CredentialError, CredentialStore, StoredCredentials
from .device import GitHubService, StaleAuthorization
from .fixtures.keychain import MemoryKeychain
from .models import GitHubConnection
from .oauth import DeviceCode, GitHubRequestError, PollResult, Tokens

pytestmark = pytest.mark.django_db


class Clock:
    def __init__(self):
        self.now = 1000

    def __call__(self):
        return self.now

    def advance(self, seconds=5):
        self.now += seconds


class FakeGitHub:
    def __init__(self):
        self.poll_calls = 0
        self.start_calls = 0
        self.profile_calls = 0
        self.result = PollResult(error="authorization_pending")
        self.account = {"account_id": 42, "login": "chosen-user", "name": "Chosen User"}

    def request_device_code(self):
        self.start_calls += 1
        return DeviceCode("private-device-code", "ABCD-1234", 900, 5)

    def poll_tokens(self, code):
        assert code == "private-device-code"
        self.poll_calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result

    def user(self, token):
        assert token == "ghu_fake-access"
        self.profile_calls += 1
        return self.account

    def approve(self):
        self.result = PollResult(
            tokens=Tokens("ghu_fake-access", "ghr_fake-refresh", 29800, 15898600)
        )


@pytest.fixture
def service(settings, tmp_path, monkeypatch):
    settings.DATA_DIR = tmp_path
    settings.TORCHBEARER_GITHUB_CLIENT_ID = "Iv1.torchbearer"
    clock = Clock()
    remote = FakeGitHub()
    store = CredentialStore(backend=MemoryKeychain())

    def client_factory(client_id):
        assert client_id == "Iv1.torchbearer"
        return remote

    instance = GitHubService(
        store=store, client_factory=client_factory, clock=clock, wall_clock=clock
    )
    instance.test_remote = remote
    instance.test_clock = clock
    monkeypatch.setattr(views, "github", instance)
    return instance


@pytest.fixture
def client():
    return APIClient(enforce_csrf_checks=True)


def write(client, method, name, data=None):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    return getattr(client, method)(reverse(name), data or {}, format="json", HTTP_X_CSRFTOKEN=token)


def start(client):
    response = write(client, "post", "github-connect")
    assert response.status_code == 200
    return response.json()["authorization"]["id"]


def poll(client, authorization_id):
    return write(client, "post", "github-poll", {"authorization_id": authorization_id})


def connect_account(client, service):
    authorization_id = start(client)
    service.test_remote.approve()
    service.test_clock.advance()
    response = poll(client, authorization_id)
    assert response.json()["account"]["login"] == "chosen-user"
    return authorization_id


def test_native_authorization_persists_only_verified_identity_without_cli(
    client, service, monkeypatch
):
    monkeypatch.setenv("PATH", "")
    monkeypatch.setenv("GH_TOKEN", "unrelated-environment-token")
    assert client.get(reverse("github-connection")).json()["available"] is True
    authorization_id = start(client)
    waiting = poll(client, authorization_id).json()
    assert waiting["account"] is None
    assert waiting["authorization"]["user_code"] == "ABCD-1234"
    assert waiting["authorization"]["verification_url"] == "https://github.com/login/device"
    assert waiting["authorization"]["poll_after"] == 5
    assert waiting["authorization"]["expires_at"]
    assert service.test_remote.poll_calls == 0
    assert not GitHubConnection.objects.exists()
    service.test_clock.advance()
    service.test_remote.approve()
    response = poll(client, authorization_id)
    assert response.json()["account"]["id"] == 42
    assert response.json()["account"]["reauthorization_required"] is False
    assert response.json()["authorization"] is None
    connection = GitHubConnection.objects.get()
    assert connection.client_id == "Iv1.torchbearer"
    assert str(connection.credential_id) == authorization_id
    assert service.store.read(connection.credential_id).tokens.refresh_token == "ghr_fake-refresh"
    assert "fake-access" not in response.content.decode()
    assert "private-device-code" not in response.content.decode()
    assert "fake-access" not in json.dumps(list(GitHubConnection.objects.values()), default=str)
    assert response.headers["Cache-Control"] == "no-store"
    fresh = GitHubService(store=service.store)
    assert fresh.status()["account"] == response.json()["account"]


def test_duplicate_connect_and_early_polls_do_not_contact_github_again(client, service):
    authorization_id = start(client)
    assert start(client) == authorization_id
    assert service.test_remote.start_calls == 1
    for _ in range(3):
        poll(client, authorization_id)
    assert service.test_remote.poll_calls == 0
    service.test_clock.advance()
    poll(client, authorization_id)
    poll(client, authorization_id)
    assert service.test_remote.poll_calls == 1


def test_slow_down_and_rate_limits_are_enforced_server_side(client, service):
    authorization_id = start(client)
    service.test_clock.advance()
    service.test_remote.result = PollResult(error="slow_down", interval=8)
    assert poll(client, authorization_id).json()["authorization"]["poll_after"] == 10
    service.test_clock.advance(9)
    poll(client, authorization_id)
    assert service.test_remote.poll_calls == 1
    service.test_clock.advance(1)
    service.test_remote.result = GitHubRequestError(
        "GitHub is busy.", code="rate_limited", retry_after=45
    )
    response = poll(client, authorization_id)
    assert response.json()["authorization"]["poll_after"] == 45
    assert response.json()["authorization"]["state"] == "pending"
    assert "busy" in response.json()["authorization"]["error"]
    service.test_clock.advance(44)
    poll(client, authorization_id)
    assert service.test_remote.poll_calls == 2


@pytest.mark.parametrize("error,state", [("access_denied", "failed"), ("expired_token", "expired")])
def test_rejected_or_expired_authorization_does_not_connect(client, service, error, state):
    authorization_id = start(client)
    service.test_remote.result = PollResult(error=error)
    service.test_clock.advance()
    assert poll(client, authorization_id).json()["authorization"]["state"] == state
    assert not GitHubConnection.objects.exists()
    assert service.authorization.device_code == ""
    assert service.authorization.tokens is None


def test_expiry_prevents_further_requests_and_a_new_attempt_can_start(client, service):
    authorization_id = start(client)
    service.test_clock.advance(900)
    assert poll(client, authorization_id).json()["authorization"]["state"] == "expired"
    assert service.test_remote.poll_calls == 0
    assert start(client) != authorization_id
    assert poll(client, authorization_id).status_code == 409


def test_cancellation_and_disconnect_remove_only_torchbearer_credentials(client, service):
    first = connect_account(client, service)
    second = start(client)
    assert write(client, "post", "github-cancel", {"authorization_id": second}).status_code == 200
    assert poll(client, second).status_code == 409
    assert GitHubConnection.objects.get().login == "chosen-user"
    assert service.store.read(first) is not None
    assert write(client, "delete", "github-connection").json()["account"] is None
    assert service.store.read(first) is None


def test_account_replacement_retires_old_credentials_only_after_verification(client, service):
    first = connect_account(client, service)
    second = start(client)
    service.test_remote.account = {"account_id": 99, "login": "replacement", "name": ""}
    service.test_clock.advance()
    response = poll(client, second)
    assert response.json()["account"]["login"] == "replacement"
    assert service.store.read(first) is None
    assert service.store.read(second).account_id == 99


def test_failed_secure_storage_preserves_the_previous_account(client, service, monkeypatch):
    first = connect_account(client, service)
    second = start(client)

    def locked(*args):
        raise CredentialError("Unlock your keychain and try again.")

    monkeypatch.setattr(service.store, "write", locked)
    service.test_clock.advance()
    response = poll(client, second)
    assert response.json()["authorization"]["state"] == "failed"
    assert response.json()["account"]["login"] == "chosen-user"
    assert service.store.read(first) is not None


def test_failed_database_save_discards_new_credentials_and_preserves_old_account(
    client, service, monkeypatch
):
    first = connect_account(client, service)
    second = start(client)

    def unavailable(*args, **kwargs):
        raise DatabaseError("private database details")

    monkeypatch.setattr(GitHubConnection.objects, "update_or_create", unavailable)
    service.test_clock.advance()
    response = poll(client, second)
    assert response.json()["authorization"]["state"] == "failed"
    assert "private database" not in response.content.decode()
    assert str(GitHubConnection.objects.get().credential_id) == first
    assert service.store.read(first) is not None
    assert service.store.read(second) is None


def test_profile_retry_keeps_issued_tokens_in_memory_without_exchanging_device_code_again(
    client, service, monkeypatch
):
    authorization_id = start(client)
    service.test_remote.approve()
    service.test_clock.advance()
    original = service.test_remote.user

    def offline(token):
        raise GitHubRequestError("GitHub is temporarily unavailable.", code="unavailable")

    monkeypatch.setattr(service.test_remote, "user", offline)
    assert poll(client, authorization_id).json()["authorization"]["state"] == "pending"
    monkeypatch.setattr(service.test_remote, "user", original)
    service.test_clock.advance()
    assert poll(client, authorization_id).json()["account"]["login"] == "chosen-user"
    assert service.test_remote.poll_calls == 1


@pytest.mark.parametrize("during", ["profile", "storage"])
def test_cancel_during_external_io_cannot_save_a_late_connection(
    client, service, monkeypatch, during
):
    authorization_id = start(client)
    service.test_remote.approve()
    service.test_clock.advance()
    entered, release = threading.Event(), threading.Event()
    errors = []

    def delayed_profile(token):
        entered.set()
        assert release.wait(10)
        return service.test_remote.account

    original_write = service.store.write

    def delayed_write(*args):
        entered.set()
        assert release.wait(10)
        original_write(*args)

    if during == "profile":
        monkeypatch.setattr(service.test_remote, "user", delayed_profile)
    else:
        monkeypatch.setattr(service.store, "write", delayed_write)

    def background():
        try:
            service.poll(authorization_id)
        except StaleAuthorization as error:
            errors.append(error)

    thread = threading.Thread(target=background)
    thread.start()
    try:
        assert entered.wait(10)
        assert (
            write(
                client, "post", "github-cancel", {"authorization_id": authorization_id}
            ).status_code
            == 200
        )
    finally:
        release.set()
        thread.join(10)
    assert not thread.is_alive()
    assert len(errors) == 1
    assert not GitHubConnection.objects.exists()
    assert service.store.read(authorization_id) is None


def test_old_cli_connections_and_changed_app_identity_require_new_consent(
    client, service, settings
):
    GitHubConnection.objects.create(account_id=1, login="previous-user")
    assert (
        client.get(reverse("github-connection")).json()["account"]["reauthorization_required"]
        is True
    )
    connect_account(client, service)
    settings.TORCHBEARER_GITHUB_CLIENT_ID = "Iv1.other-app"
    assert (
        client.get(reverse("github-connection")).json()["account"]["reauthorization_required"]
        is True
    )


def test_missing_publisher_id_and_unavailable_keychain_are_actionable(
    client, service, settings, monkeypatch
):
    settings.TORCHBEARER_GITHUB_CLIENT_ID = ""
    response = client.get(reverse("github-connection"))
    assert response.json()["available"] is False
    assert "publisher" in response.json()["unavailable_reason"]
    assert write(client, "post", "github-connect").status_code == 503
    settings.TORCHBEARER_GITHUB_CLIENT_ID = "Iv1.torchbearer"

    def locked():
        raise CredentialError("Unlock your system keychain.")

    monkeypatch.setattr(service.store, "ready", locked)
    assert "keychain" in client.get(reverse("github-connection")).json()["unavailable_reason"]
    assert write(client, "post", "github-connect").status_code == 503
    assert service.test_remote.start_calls == 0


@pytest.mark.parametrize(
    "method,name",
    [
        ("post", "github-connect"),
        ("post", "github-poll"),
        ("post", "github-cancel"),
        ("post", "github-verify"),
        ("delete", "github-connection"),
    ],
)
def test_connection_mutations_require_csrf(client, service, method, name):
    assert getattr(client, method)(reverse(name), {}, format="json").status_code == 403
    assert service.authorization is None


def test_bad_attempt_ids_and_safe_methods_cannot_start_authorization(client, service):
    assert write(client, "post", "github-poll", {"authorization_id": "../path"}).status_code == 400
    assert poll(client, str(uuid.uuid4())).status_code == 409
    assert client.get(reverse("github-connect")).status_code == 405
    assert service.authorization is None


def verify(client):
    return write(client, "post", "github-verify")


def expire_saved_access(service):
    saved = GitHubConnection.objects.get()
    service.store.write(
        saved.credential_id,
        StoredCredentials(
            saved.client_id,
            saved.account_id,
            Tokens(
                "ghu_fake-access",
                "ghr_fake-refresh",
                service.wall_clock() - 1,
                service.wall_clock() + 10000,
            ),
        ),
    )
    return saved


def install_refresh(service, monkeypatch):
    calls = []
    rotated = Tokens(
        "ghu_rotated", "ghr_rotated", service.wall_clock() + 28800, service.wall_clock() + 15897600
    )

    def refresh(token):
        assert token == "ghr_fake-refresh"
        calls.append(token)
        return rotated

    monkeypatch.setattr(service.test_remote, "refresh_tokens", refresh, raising=False)
    monkeypatch.setattr(service.test_remote, "user", lambda token: service.test_remote.account)
    return calls, rotated


def test_verify_updates_a_renamed_profile_without_changing_account_or_connection_date(
    client, service
):
    connect_account(client, service)
    saved = GitHubConnection.objects.get()
    service.test_remote.account = {"account_id": 42, "login": "renamed-user", "name": "New Name"}
    response = verify(client)
    assert response.status_code == 200
    assert response.json()["account"]["login"] == "renamed-user"
    saved.refresh_from_db()
    assert saved.account_id == 42
    assert saved.connected_at.isoformat() == response.json()["account"]["connected_at"]
    assert response.headers["Cache-Control"] == "no-store"


def test_expired_access_rotates_credentials_once_and_a_new_service_uses_them(
    client, service, monkeypatch
):
    connect_account(client, service)
    saved = expire_saved_access(service)
    calls, rotated = install_refresh(service, monkeypatch)
    assert verify(client).json()["account"]["reauthorization_required"] is False
    assert calls == ["ghr_fake-refresh"]
    assert service.store.read(saved.credential_id).tokens == rotated
    assert verify(client).status_code == 200
    assert len(calls) == 1
    fresh = GitHubService(
        store=service.store,
        client_factory=service.client_factory,
        clock=service.clock,
        wall_clock=service.wall_clock,
    )
    assert fresh.verify()["account"]["id"] == 42
    assert len(calls) == 1


def test_unauthorized_access_can_refresh_even_before_local_expiry(client, service, monkeypatch):
    connect_account(client, service)
    calls, _ = install_refresh(service, monkeypatch)

    def user(token):
        if token == "ghu_fake-access":
            raise GitHubRequestError("Access is no longer valid.", code="unauthorized")
        assert token == "ghu_rotated"
        return service.test_remote.account

    monkeypatch.setattr(service.test_remote, "user", user)
    assert verify(client).json()["account"]["reauthorization_required"] is False
    assert len(calls) == 1


@pytest.mark.parametrize("issue", ["missing", "corrupt", "wrong-app", "wrong-account"])
def test_missing_or_mismatched_saved_credentials_require_reauthorization_without_api_use(
    client, service, issue
):
    connect_account(client, service)
    saved = GitHubConnection.objects.get()
    if issue == "missing":
        service.store.delete(saved.credential_id)
    elif issue == "corrupt":
        backend = service.store.backend()
        backend.set_password(
            service.store._service(saved.credential_id), "oauth", "invalid-secret-content"
        )
    else:
        service.store.write(
            saved.credential_id,
            StoredCredentials(
                "other-app" if issue == "wrong-app" else saved.client_id,
                99 if issue == "wrong-account" else saved.account_id,
                Tokens("other-account-token"),
            ),
        )
    prior_calls = service.test_remote.profile_calls
    assert (
        client.get(reverse("github-connection")).json()["account"]["reauthorization_required"]
        is True
    )
    response = verify(client)
    assert response.json()["account"]["reauthorization_required"] is True
    assert response.json()["account"]["id"] == 42
    assert service.test_remote.profile_calls == prior_calls
    assert service.store.read(saved.credential_id) is None
    assert "secret-content" not in response.content.decode()


def test_remote_account_mismatch_cannot_switch_the_saved_identity(client, service):
    connect_account(client, service)
    saved = GitHubConnection.objects.get()
    service.test_remote.account = {"account_id": 99, "login": "other-user", "name": "Other"}
    response = verify(client)
    assert response.json()["account"]["id"] == 42
    assert response.json()["account"]["login"] == "chosen-user"
    assert response.json()["account"]["reauthorization_required"] is True
    assert service.store.read(saved.credential_id) is None


def test_revoked_refresh_clears_credentials_but_retains_account_context(
    client, service, monkeypatch
):
    connect_account(client, service)
    saved = expire_saved_access(service)

    def revoked(token):
        raise GitHubRequestError(
            "GitHub authorization has expired. Connect again.", code="reauthorization_required"
        )

    monkeypatch.setattr(service.test_remote, "refresh_tokens", revoked, raising=False)
    response = verify(client)
    assert response.json()["account"]["reauthorization_required"] is True
    assert service.store.read(saved.credential_id) is None
    assert GitHubConnection.objects.get().account_id == 42


def test_temporary_profile_outage_after_rotation_keeps_the_new_refresh_token(
    client, service, monkeypatch
):
    connect_account(client, service)
    saved = expire_saved_access(service)
    calls, rotated = install_refresh(service, monkeypatch)

    def offline(token):
        raise GitHubRequestError("GitHub is temporarily unavailable.", code="unavailable")

    monkeypatch.setattr(service.test_remote, "user", offline)
    assert verify(client).status_code == 503
    assert service.store.read(saved.credential_id).tokens == rotated
    monkeypatch.setattr(service.test_remote, "user", lambda token: service.test_remote.account)
    assert verify(client).status_code == 200
    assert len(calls) == 1


def test_locked_keychain_is_reported_without_erasing_account_or_leaking_backend_details(
    client, service, monkeypatch
):
    connect_account(client, service)

    def locked(credential_id):
        raise CredentialError("Unlock your system keychain.")

    monkeypatch.setattr(service.store, "read", locked)
    response = client.get(reverse("github-connection"))
    assert response.json()["available"] is False
    assert "keychain" in response.json()["unavailable_reason"]
    assert response.json()["account"]["reauthorization_required"] is False
    assert verify(client).status_code == 503
    assert GitHubConnection.objects.exists()


def test_expired_refresh_requires_sign_in_without_sending_a_refresh_request(client, service):
    connect_account(client, service)
    saved = GitHubConnection.objects.get()
    service.store.write(
        saved.credential_id,
        StoredCredentials(
            saved.client_id,
            saved.account_id,
            Tokens(
                "ghu_fake-access",
                "ghr_expired",
                service.wall_clock() - 1,
                service.wall_clock() - 1,
            ),
        ),
    )
    response = verify(client)
    assert response.json()["account"]["reauthorization_required"] is True
    assert service.store.read(saved.credential_id) is None


def test_rotation_storage_failure_requires_reauthorization(client, service, monkeypatch):
    connect_account(client, service)
    expire_saved_access(service)
    calls, _ = install_refresh(service, monkeypatch)

    def locked(*args):
        raise CredentialError("Could not save credentials. Unlock your keychain and reconnect.")

    monkeypatch.setattr(service.store, "write", locked)
    assert verify(client).status_code == 503
    assert len(calls) == 1
    assert (
        client.get(reverse("github-connection")).json()["account"]["reauthorization_required"]
        is True
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_saved_checks_rotate_the_refresh_token_only_once(client, service, monkeypatch):
    connect_account(client, service)
    expire_saved_access(service)
    calls, rotated = install_refresh(service, monkeypatch)
    entered, release = threading.Event(), threading.Event()
    outcomes = []
    errors = []

    def delayed_refresh(token):
        calls.append(token)
        entered.set()
        assert release.wait(10)
        return rotated

    monkeypatch.setattr(service.test_remote, "refresh_tokens", delayed_refresh)

    def background():
        try:
            outcomes.append(service.verify())
        except Exception as error:
            errors.append(error)
        finally:
            close_old_connections()

    first = threading.Thread(target=background)
    second = threading.Thread(target=background)
    first.start()
    try:
        assert entered.wait(10)
        second.start()
    finally:
        release.set()
        first.join(10)
        if second.ident is not None:
            second.join(10)
    assert not first.is_alive() and not second.is_alive()
    assert not errors
    assert len(outcomes) == 2
    assert len(calls) == 1
    assert all(not outcome["account"]["reauthorization_required"] for outcome in outcomes)


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("during", ["refresh", "storage", "profile"])
def test_disconnect_during_saved_verification_cannot_restore_credentials(
    client, service, monkeypatch, during
):
    connect_account(client, service)
    saved = expire_saved_access(service)
    _, rotated = install_refresh(service, monkeypatch)
    entered, release = threading.Event(), threading.Event()
    errors = []
    original_write = service.store.write

    def wait():
        entered.set()
        assert release.wait(10)

    def delayed_refresh(token):
        wait()
        return rotated

    def delayed_write(*args):
        wait()
        original_write(*args)

    def delayed_profile(token):
        wait()
        return service.test_remote.account

    if during == "refresh":
        monkeypatch.setattr(service.test_remote, "refresh_tokens", delayed_refresh)
    elif during == "storage":
        monkeypatch.setattr(service.store, "write", delayed_write)
    else:
        monkeypatch.setattr(service.test_remote, "user", delayed_profile)

    def background():
        try:
            service.verify()
        except StaleAuthorization as error:
            errors.append(error)
        finally:
            close_old_connections()

    thread = threading.Thread(target=background)
    thread.start()
    try:
        assert entered.wait(10)
        assert write(client, "delete", "github-connection").json()["account"] is None
    finally:
        release.set()
        thread.join(10)
    assert not thread.is_alive()
    assert len(errors) == 1
    assert not GitHubConnection.objects.exists()
    assert service.store.read(saved.credential_id) is None
