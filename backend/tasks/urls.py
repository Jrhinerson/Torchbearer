from django.urls import path

from .views import (
    CancelRunView,
    TaskActionView,
    TaskDeleteView,
    TaskListCreateView,
    TaskRunsView,
    WorkspaceView,
)

urlpatterns = [
    path("", TaskListCreateView.as_view(), name="task-list"),
    path("<uuid:pk>/", TaskDeleteView.as_view(), name="task-detail"),
    path("<uuid:pk>/actions/", TaskActionView.as_view(), name="task-action"),
    path("<uuid:pk>/runs/", TaskRunsView.as_view(), name="task-runs"),
    path("<uuid:pk>/workspace/", WorkspaceView.as_view(), name="task-workspace"),
    path("<uuid:pk>/runs/<uuid:run_id>/cancel/", CancelRunView.as_view(), name="cancel-run"),
]
