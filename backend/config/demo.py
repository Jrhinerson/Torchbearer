"""Demo requests are read-only, including connections and project operations."""

from django.conf import settings
from django.http import JsonResponse


class DemoReadOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.DEMO_MODE and request.method not in {"GET", "HEAD", "OPTIONS"}:
            return JsonResponse(
                {"detail": "This demo is read-only. Agent execution and changes are disabled."},
                status=403,
            )
        return self.get_response(request)
