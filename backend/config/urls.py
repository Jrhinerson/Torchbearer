from django.urls import include, path

from .views import csrf_token, health

urlpatterns = [
    path("api/v1/health/", health, name="health"),
    path("api/v1/csrf/", csrf_token, name="csrf-token"),
    path("api/v1/tasks/", include("tasks.urls")),
]
