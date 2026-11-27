import io
import json
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs

import pytest

from .oauth import (
    DEVICE_URL,
    TOKEN_URL,
    USER_URL,
    VERIFICATION_URL,
    GitHubOAuthClient,
    GitHubRequestError,
    NoRedirects,
    Tokens,
)


class FakeOpener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        assert timeout == 15
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return io.BytesIO(
            response if isinstance(response, bytes) else json.dumps(response).encode()
        )


def token_response(**changes):
    return {
        "access_token": "ghu_fake-access",
        "token_type": "bearer",
        "expires_in": 28800,
        "refresh_token": "ghr_fake-refresh",
        "refresh_token_expires_in": 15897600,
        **changes,
    }


def device_response(**changes):
    return {
        "device_code": "server-only-device-code",
        "user_code": "ABCD-1234",
        "verification_uri": VERIFICATION_URL,
        "expires_in": 900,
        "interval": 5,
        **changes,
    }


def test_direct_device_authorization_and_authenticated_account_lookup():
    opener = FakeOpener(
        device_response(),
        {"error": "authorization_pending"},
        {"error": "slow_down", "interval": 10},
        token_response(),
        {"id": 42, "login": "selected-user", "name": "Selected User"},
    )
    client = GitHubOAuthClient("Iv1.publisher", opener=opener, clock=lambda: 1000)
    code = client.request_device_code()
    assert code.interval == 5
    assert code.expires_in == 900
    assert "server-only-device-code" not in repr(code)
    assert client.poll_tokens(code.device_code).error == "authorization_pending"
    assert client.poll_tokens(code.device_code).interval == 10
    tokens = client.poll_tokens(code.device_code).tokens
    assert tokens.expires_at == 29800
    assert "ghu_fake-access" not in repr(tokens)
    assert client.user(tokens.access_token)["account_id"] == 42
    assert [request.full_url for request in opener.requests] == [
        DEVICE_URL,
        TOKEN_URL,
        TOKEN_URL,
        TOKEN_URL,
        USER_URL,
    ]
    assert parse_qs(opener.requests[0].data.decode()) == {
        "client_id": ["Iv1.publisher"],
        "scope": ["offline_access"],
    }
    assert parse_qs(opener.requests[1].data.decode())["device_code"] == [code.device_code]
    assert opener.requests[-1].get_header("Authorization") == "Bearer ghu_fake-access"
    assert all(b"client_secret" not in (request.data or b"") for request in opener.requests)


def test_refresh_rotates_tokens_without_an_app_secret():
    opener = FakeOpener(token_response(access_token="ghu_rotated", refresh_token="ghr_rotated"))
    client = GitHubOAuthClient("Iv1.publisher", opener=opener, clock=lambda: 2000)
    tokens = client.refresh_tokens("ghr_original")
    assert tokens.refresh_token == "ghr_rotated"
    assert parse_qs(opener.requests[0].data.decode()) == {
        "client_id": ["Iv1.publisher"],
        "grant_type": ["refresh_token"],
        "refresh_token": ["ghr_original"],
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"verification_uri": "https://evil.example/login"},
        {"user_code": "bad"},
        {"expires_in": -1},
        {"expires_in": True},
        {"interval": 0},
        {"device_code": ""},
    ],
)
def test_rejects_malformed_device_responses(changes):
    with pytest.raises(GitHubRequestError):
        GitHubOAuthClient(
            "public-id", opener=FakeOpener(device_response(**changes))
        ).request_device_code()


@pytest.mark.parametrize("response", [b"not json secret-value", b"x" * 65537, b"[]"])
def test_rejects_invalid_or_oversized_http_responses_without_leaking_body(response):
    with pytest.raises(GitHubRequestError) as caught:
        GitHubOAuthClient("public-id", opener=FakeOpener(response)).request_device_code()
    assert "secret-value" not in str(caught.value)


@pytest.mark.parametrize(
    "changes",
    [
        {"token_type": "unknown"},
        {"access_token": "has whitespace"},
        {"expires_in": 0},
        {"refresh_token": None},
        {"refresh_token_expires_in": False},
    ],
)
def test_rejects_invalid_token_responses(changes):
    with pytest.raises(GitHubRequestError):
        GitHubOAuthClient("public-id", opener=FakeOpener(token_response(**changes))).poll_tokens(
            "device"
        )


@pytest.mark.parametrize(
    "account",
    [
        {"id": True, "login": "user"},
        {"id": -1, "login": "user"},
        {"id": 42, "login": "../other"},
        {"id": 42, "login": "user", "name": []},
    ],
)
def test_rejects_invalid_account_identity(account):
    with pytest.raises(GitHubRequestError):
        GitHubOAuthClient("public-id", opener=FakeOpener(account)).user("fake-token")


def test_no_redirects_and_no_raw_network_or_error_details():
    assert NoRedirects().redirect_request(None, None, 302, "", {}, "https://evil.example") is None
    error = HTTPError(
        TOKEN_URL,
        302,
        "sensitive-error",
        {"Location": "https://evil.example"},
        io.BytesIO(b"secret-body"),
    )
    client = GitHubOAuthClient("public-id", opener=FakeOpener(error))
    with pytest.raises(GitHubRequestError) as caught:
        client.refresh_tokens("fake-refresh")
    assert "secret" not in str(caught.value)
    with pytest.raises(GitHubRequestError) as caught:
        GitHubOAuthClient(
            "public-id", opener=FakeOpener(URLError("secret-network-info"))
        ).request_device_code()
    assert "secret" not in str(caught.value)


def test_unauthorized_rate_limited_and_revoked_refresh_are_distinct():
    error = HTTPError(USER_URL, 401, "private", {}, io.BytesIO(b"secret"))
    with pytest.raises(GitHubRequestError) as caught:
        GitHubOAuthClient("public-id", opener=FakeOpener(error)).user("fake-token")
    assert caught.value.code == "unauthorized"
    error = HTTPError(TOKEN_URL, 429, "private", {"Retry-After": "45"}, io.BytesIO(b"secret"))
    with pytest.raises(GitHubRequestError) as caught:
        GitHubOAuthClient("public-id", opener=FakeOpener(error)).poll_tokens("fake-device")
    assert caught.value.code == "rate_limited"
    assert caught.value.retry_after == 45
    error = HTTPError(
        TOKEN_URL,
        400,
        "private",
        {},
        io.BytesIO(b'{"error":"bad_refresh_token","error_description":"secret"}'),
    )
    with pytest.raises(GitHubRequestError) as caught:
        GitHubOAuthClient("public-id", opener=FakeOpener(error)).refresh_tokens("fake-refresh")
    assert caught.value.code == "reauthorization_required"
    assert "secret" not in str(caught.value)


def test_nonexpiring_token_is_supported_when_github_omits_expiry():
    tokens = Tokens.from_response({"access_token": "fake-token", "token_type": "bearer"}, 1000)
    assert tokens.expires_at is None
