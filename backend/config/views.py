from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET


@require_GET
def health(request):
    return JsonResponse({"status": "ok", "service": "torchbearer"})


@require_GET
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})


def csrf_failure(request, reason=""):
    return JsonResponse(
        {"detail": "Your request could not be verified. Please try again."}, status=403
    )
