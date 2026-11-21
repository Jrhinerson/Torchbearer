from django.urls import path

from .views import TaskDeleteView, TaskListCreateView

urlpatterns = [
    path("", TaskListCreateView.as_view(), name="task-list"),
    path("<uuid:pk>/", TaskDeleteView.as_view(), name="task-detail"),
]
