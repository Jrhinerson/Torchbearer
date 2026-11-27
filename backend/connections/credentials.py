"""Application-owned credentials in the OS vault. Never fall back to files."""

import hashlib
import json
import math
import sys
import uuid
from dataclasses import dataclass, field

from django.conf import settings

from .oauth import Tokens, secret_string


class CredentialError(Exception):
    pass


class InvalidCredentials(CredentialError):
    pass


def secure_backend():
    try:
        if sys.platform == "win32":
            from keyring.backends.Windows import WinVaultKeyring as Backend
        elif sys.platform == "darwin":
            from keyring.backends.macOS import Keyring as Backend
        elif sys.platform == "linux":
            from keyring.backends.SecretService import Keyring as Backend
        else:
            raise RuntimeError
        backend = Backend()
        if backend.priority <= 0:
            raise RuntimeError
        return backend
    except Exception:
        raise CredentialError(
            "Secure credential storage is unavailable. Unlock your system keychain and try again."
        ) from None


@dataclass(frozen=True)
class StoredCredentials:
    client_id: str
    account_id: int
    tokens: Tokens = field(repr=False)


class CredentialStore:
    def __init__(self, *, backend=None):
        self._backend = backend

    def backend(self):
        return self._backend if self._backend is not None else secure_backend()

    def ready(self):
        self.backend()

    def _service(self, credential_id):
        namespace = hashlib.sha256(str(settings.DATA_DIR.resolve()).encode()).hexdigest()[:24]
        return f"Torchbearer:github:{namespace}:{uuid.UUID(str(credential_id))}"

    def read(self, credential_id):
        try:
            raw = self.backend().get_password(self._service(credential_id), "oauth")
        except Exception:
            raise CredentialError(
                "Could not read GitHub credentials. Unlock your system keychain and try again."
            ) from None
        if raw is None:
            return None
        try:
            data = json.loads(raw)
            tokens = Tokens(**data["tokens"])
            secret_string(tokens.access_token)
            if tokens.refresh_token is not None:
                secret_string(tokens.refresh_token)
            for expiry in (tokens.expires_at, tokens.refresh_expires_at):
                if expiry is not None and (
                    isinstance(expiry, bool)
                    or not isinstance(expiry, (int, float))
                    or not math.isfinite(expiry)
                ):
                    raise ValueError
            if (
                not isinstance(data["client_id"], str)
                or not data["client_id"]
                or isinstance(data["account_id"], bool)
                or not isinstance(data["account_id"], int)
                or data["account_id"] <= 0
            ):
                raise ValueError
            return StoredCredentials(data["client_id"], data["account_id"], tokens)
        except Exception:
            raise InvalidCredentials(
                "Saved GitHub credentials are invalid. Connect again."
            ) from None

    def write(self, credential_id, credentials):
        data = json.dumps(
            {
                "client_id": credentials.client_id,
                "account_id": credentials.account_id,
                "tokens": credentials.tokens.to_dict(),
            }
        )
        try:
            self.backend().set_password(self._service(credential_id), "oauth", data)
        except Exception:
            raise CredentialError(
                "Could not securely save GitHub credentials. Unlock your keychain and try again."
            ) from None

    def delete(self, credential_id):
        try:
            backend = self.backend()
            service = self._service(credential_id)
            if backend.get_password(service, "oauth") is not None:
                backend.delete_password(service, "oauth")
        except Exception:
            raise CredentialError(
                "Could not remove GitHub credentials. Unlock your keychain and try again."
            ) from None
