from django.urls import include, path
from tasks.views import ActivityView, OperationsView, RepositoryListView, RoutingView

from .views import csrf_token, health

urlpatterns = [
    path("api/v1/", include("workflows.urls")),
    path("api/v1/health/", health, name="health"),
    path("api/v1/csrf/", csrf_token, name="csrf-token"),
    path("api/v1/tasks/", include("tasks.urls")),
    path("api/v1/routing/", RoutingView.as_view(), name="routing"),
    path("api/v1/operations/", OperationsView.as_view(), name="operations"),
    path("api/v1/operations/activity/", ActivityView.as_view(), name="operations-activity"),
    path("api/v1/repositories/", RepositoryListView.as_view(), name="repositories"),
    path("api/v1/projects/", include("projects.urls")),
    path("api/v1/connections/", include("connections.urls")),
]
