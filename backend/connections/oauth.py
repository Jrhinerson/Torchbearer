"""GitHub App device OAuth and authenticated HTTPS, without external executables."""

import json
import re
import time
from dataclasses import asdict, dataclass, field
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

VERIFICATION_URL = "https://github.com/login/device"
DEVICE_URL = "https://github.com/login/device/code"
TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
MAX_RESPONSE_BYTES = 65536


class GitHubRequestError(Exception):
    def __init__(
        self, message="Could not reach GitHub. Please try again.", *, code="", retry_after=0
    ):
        super().__init__(message)
        self.code = code
        self.retry_after = retry_after


def positive_seconds(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 < value <= 31536000:
        raise GitHubRequestError("GitHub returned an invalid response. Please try again.")
    return value


def secret_string(value):
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 4096
        or any(c.isspace() for c in value)
    ):
        raise GitHubRequestError("GitHub returned invalid credentials. Connect again.")
    return value


@dataclass(frozen=True)
class Tokens:
    access_token: str = field(repr=False)
    refresh_token: str | None = field(default=None, repr=False)
    expires_at: float | None = None
    refresh_expires_at: float | None = None

    @classmethod
    def from_response(cls, data, now):
        try:
            if data.get("token_type", "").lower() != "bearer":
                raise ValueError
            access = secret_string(data["access_token"])
            refresh = secret_string(data["refresh_token"]) if data.get("refresh_token") else None
            expires = now + positive_seconds(data["expires_in"]) if "expires_in" in data else None
            refresh_expires = (
                now + positive_seconds(data["refresh_token_expires_in"])
                if refresh and "refresh_token_expires_in" in data
                else None
            )
            if expires is not None and refresh is None:
                raise ValueError
            return cls(access, refresh, expires, refresh_expires)
        except (KeyError, TypeError, ValueError, AttributeError) as error:
            raise GitHubRequestError(
                "GitHub returned invalid credentials. Connect again."
            ) from error

    def to_dict(self):
        return asdict(self)


@dataclass(frozen=True)
class DeviceCode:
    device_code: str = field(repr=False)
    user_code: str
    expires_in: int
    interval: int


@dataclass(frozen=True)
class PollResult:
    tokens: Tokens | None = field(default=None, repr=False)
    error: str = ""
    interval: int = 0


class NoRedirects(HTTPRedirectHandler):
    # Never forward access tokens or refresh tokens through an HTTP redirect.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHubOAuthClient:
    def __init__(self, client_id, *, opener=None, clock=time.time):
        self.client_id = client_id
        self.opener = opener or build_opener(NoRedirects())
        self.clock = clock

    def _json(self, url, *, form=None, token=None):
        headers = {"Accept": "application/json", "User-Agent": "Torchbearer"}
        if token:
            headers.update(
                Authorization=f"Bearer {secret_string(token)}",
                Accept="application/vnd.github+json",
                **{"X-GitHub-Api-Version": "2026-03-10"},
            )
        if form is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        request = Request(
            url, data=urlencode(form).encode() if form is not None else None, headers=headers
        )
        try:
            response = self.opener.open(request, timeout=15)
        except HTTPError as error:
            if error.code == 401 and token:
                error.close()
                raise GitHubRequestError(
                    "GitHub authorization is no longer valid. Connect again.", code="unauthorized"
                ) from None
            if form is not None and error.code in {400, 401, 403}:
                response = error
            else:
                retry = error.headers.get("Retry-After", "0")
                retry_after = min(300, max(1, int(retry))) if retry.isdigit() else 60
                code = "rate_limited" if error.code in {403, 429} else "unavailable"
                error.close()
                raise GitHubRequestError(
                    "GitHub is temporarily unavailable. Please try again.",
                    code=code,
                    retry_after=retry_after,
                ) from None
        except OSError, URLError, TimeoutError:
            raise GitHubRequestError() from None
        try:
            with response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError
            return data
        except ValueError, OSError:
            raise GitHubRequestError(
                "GitHub returned an invalid response. Please try again."
            ) from None

    def request_device_code(self):
        data = self._json(DEVICE_URL, form={"client_id": self.client_id, "scope": "offline_access"})
        if data.get("error"):
            raise GitHubRequestError(
                "GitHub sign-in is not configured correctly. Contact the app publisher.",
                code="configuration",
            )
        try:
            if data["verification_uri"] != VERIFICATION_URL or not re.fullmatch(
                r"[A-Z0-9]{4}-[A-Z0-9]{4}", data["user_code"]
            ):
                raise ValueError
            return DeviceCode(
                secret_string(data["device_code"]),
                data["user_code"],
                min(900, positive_seconds(data["expires_in"])),
                positive_seconds(data["interval"]),
            )
        except KeyError, TypeError, ValueError:
            raise GitHubRequestError(
                "GitHub returned an invalid sign-in code. Try again."
            ) from None

    def poll_tokens(self, device_code):
        data = self._json(
            TOKEN_URL,
            form={
                "client_id": self.client_id,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        if error := data.get("error"):
            if not isinstance(error, str) or error not in {
                "authorization_pending",
                "slow_down",
                "access_denied",
                "expired_token",
                "token_expired",
                "incorrect_device_code",
                "bad_verification_code",
            }:
                raise GitHubRequestError(
                    "GitHub sign-in could not be completed. Try again.", code="authorization_failed"
                )
            return PollResult(
                error=error,
                interval=positive_seconds(data["interval"]) if "interval" in data else 0,
            )
        return PollResult(tokens=Tokens.from_response(data, self.clock()))

    def refresh_tokens(self, refresh_token):
        data = self._json(
            TOKEN_URL,
            form={
                "client_id": self.client_id,
                "grant_type": "refresh_token",
                "refresh_token": secret_string(refresh_token),
            },
        )
        if data.get("error"):
            raise GitHubRequestError(
                "GitHub authorization has expired. Connect again.", code="reauthorization_required"
            )
        return Tokens.from_response(data, self.clock())

    def user(self, token):
        data = self._json(USER_URL, token=token)
        try:
            if (
                isinstance(data["id"], bool)
                or not isinstance(data["id"], int)
                or not 0 < data["id"] < 2**63
                or not isinstance(data["login"], str)
                or not re.fullmatch(r"[A-Za-z0-9-]{1,39}", data["login"])
                or (data.get("name") is not None and not isinstance(data["name"], str))
            ):
                raise ValueError
            return {
                "account_id": data["id"],
                "login": data["login"],
                "name": (data.get("name") or "")[:255],
            }
        except KeyError, TypeError, ValueError:
            raise GitHubRequestError(
                "Could not verify the GitHub account. Connect again."
            ) from None
