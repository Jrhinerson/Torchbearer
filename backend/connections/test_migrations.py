import uuid

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from .credentials import CredentialStore, StoredCredentials
from .device import GitHubService
from .fixtures.keychain import MemoryKeychain
from .oauth import Tokens


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "source,client_id",
    [
        ("0001_initial", ""),
        ("0002_githubconnection_client_id", "Iv1.torchbearer"),
    ],
)
def test_upgrade_preserves_identity_and_credential_reference(settings, tmp_path, source, client_id):
    settings.DATA_DIR = tmp_path
    settings.TORCHBEARER_GITHUB_CLIENT_ID = "Iv1.torchbearer"
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    old = [("connections", source)]
    credential_id = uuid.uuid4()
    store = CredentialStore(backend=MemoryKeychain())
    try:
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        OldConnection = apps.get_model("connections", "GitHubConnection")
        data = {
            "account_id": 42,
            "login": "retained-user",
            "name": "Retained",
            "config_id": credential_id,
        }
        if client_id:
            data["client_id"] = client_id
            store.write(credential_id, StoredCredentials(client_id, 42, Tokens("fake-access")))
        saved = OldConnection.objects.create(**data)
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        CurrentConnection = apps.get_model("connections", "GitHubConnection")
        current = CurrentConnection.objects.get(pk=1)
        assert current.credential_id == credential_id
        assert current.client_id == client_id
        assert current.login == saved.login
        assert current.account_id == saved.account_id
        assert current.connected_at == saved.connected_at
        status = GitHubService(store=store).status()
        assert status["account"]["reauthorization_required"] is (not bool(client_id))
        if client_id:
            assert store.read(current.credential_id).account_id == 42
    finally:
        MigrationExecutor(connection).migrate(latest)
