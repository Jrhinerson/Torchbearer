from django.urls import path

from .views import WorkflowListView, WorkTypeDetailView, WorkTypeListView

urlpatterns = [
    path("workflows/", WorkflowListView.as_view(), name="workflow-list"),
    path("work-types/", WorkTypeListView.as_view(), name="work-type-list"),
    path("work-types/<slug:key>/", WorkTypeDetailView.as_view(), name="work-type-detail"),
]
