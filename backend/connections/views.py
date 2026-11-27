from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .device import github


class AuthorizationSerializer(serializers.Serializer):
    authorization_id = serializers.UUIDField()


@method_decorator(csrf_protect, name="dispatch")
class GitHubView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def handle_exception(self, exc):
        from .credentials import CredentialError
        from .device import GitHubError

        if isinstance(exc, CredentialError):
            exc = GitHubError(str(exc))
        return super().handle_exception(exc)

    def get(self, request):
        with github.lock:
            return Response(github.status(), headers={"Cache-Control": "no-store"})

    def delete(self, request):
        return Response(github.disconnect())


class GitHubConnectView(GitHubView):
    http_method_names = ["post", "options"]

    def post(self, request):
        return Response(github.connect(), headers={"Cache-Control": "no-store"})


class GitHubPollView(GitHubView):
    http_method_names = ["post", "options"]

    def post(self, request):
        serializer = AuthorizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            github.poll(serializer.validated_data["authorization_id"]),
            headers={"Cache-Control": "no-store"},
        )


class GitHubCancelView(GitHubView):
    http_method_names = ["post", "options"]

    def post(self, request):
        serializer = AuthorizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(github.cancel(serializer.validated_data["authorization_id"]))
