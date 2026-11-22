from django.urls import path

from .views import FolderBrowseView, ProjectDetailView, ProjectListCreateView

urlpatterns = [
    path("", ProjectListCreateView.as_view(), name="project-list"),
    path("folders/", FolderBrowseView.as_view(), name="project-folders"),
    path("<uuid:pk>/", ProjectDetailView.as_view(), name="project-detail"),
]
