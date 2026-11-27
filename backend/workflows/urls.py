from django.urls import path

from .views import WorkflowGraphView, WorkflowListView, WorkTypeDetailView, WorkTypeListView

urlpatterns = [
    path("workflows/", WorkflowListView.as_view(), name="workflow-list"),
    path("workflows/<slug:key>/graph/", WorkflowGraphView.as_view(), name="workflow-graph"),
    path("work-types/", WorkTypeListView.as_view(), name="work-type-list"),
    path("work-types/<slug:key>/", WorkTypeDetailView.as_view(), name="work-type-detail"),
]
