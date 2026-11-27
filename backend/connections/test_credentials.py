import json
import uuid

import pytest

from . import credentials as module
from .credentials import CredentialError, CredentialStore, StoredCredentials
from .oauth import Tokens


class MemoryKeychain:
    def __init__(self):
        self.values = {}

    def get_password(self, service, username):
        return self.values.get((service, username))

    def set_password(self, service, username, value):
        self.values[service, username] = value

    def delete_password(self, service, username):
        self.values.pop((service, username), None)


def test_secure_credential_roundtrip_rotation_and_deletion(settings, tmp_path):
    settings.DATA_DIR = tmp_path
    backend = MemoryKeychain()
    store = CredentialStore(backend=backend)
    credential_id = uuid.uuid4()
    credentials = StoredCredentials(
        "public-id", 42, Tokens("fake-access", "fake-refresh", 1000, 2000)
    )
    assert store.read(credential_id) is None
    store.write(credential_id, credentials)
    assert store.read(credential_id) == credentials
    assert "fake-access" not in repr(credentials)
    rotated = StoredCredentials(
        "public-id", 42, Tokens("rotated-access", "rotated-refresh", 2000, 3000)
    )
    store.write(credential_id, rotated)
    assert store.read(credential_id) == rotated
    store.delete(credential_id)
    store.delete(credential_id)
    assert not backend.values


def test_data_directories_and_credential_ids_are_isolated(settings, tmp_path):
    backend = MemoryKeychain()
    store = CredentialStore(backend=backend)
    credential_id = uuid.uuid4()
    credentials = StoredCredentials("public-id", 42, Tokens("fake-access"))
    settings.DATA_DIR = tmp_path / "first"
    store.write(credential_id, credentials)
    assert store.read(uuid.uuid4()) is None
    settings.DATA_DIR = tmp_path / "second"
    assert store.read(credential_id) is None
    assert not settings.DATA_DIR.exists()


def test_unavailable_store_fails_closed_without_files(settings, tmp_path, monkeypatch):
    settings.DATA_DIR = tmp_path

    def unavailable():
        raise RuntimeError("private-backend-details")

    monkeypatch.setattr(module, "secure_backend", unavailable)
    with pytest.raises(CredentialError) as caught:
        CredentialStore().write(
            uuid.uuid4(), StoredCredentials("public-id", 42, Tokens("fake-access"))
        )
    assert "private" not in str(caught.value)
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("raw", ["not-json fake-secret", json.dumps({"tokens": {}})])
def test_corrupt_credentials_do_not_leak_the_saved_value(settings, tmp_path, raw):
    settings.DATA_DIR = tmp_path
    backend = MemoryKeychain()
    store = CredentialStore(backend=backend)
    credential_id = uuid.uuid4()
    backend.set_password(store._service(credential_id), "oauth", raw)
    with pytest.raises(CredentialError) as caught:
        store.read(credential_id)
    assert "fake-secret" not in str(caught.value)


def test_os_store_selection_cannot_use_an_installed_plaintext_plugin(monkeypatch):
    # Select the OS backend directly, rather than keyring's extensible/chained default.
    monkeypatch.setattr(module.sys, "platform", "unknown-platform")
    with pytest.raises(CredentialError):
        module.secure_backend()
