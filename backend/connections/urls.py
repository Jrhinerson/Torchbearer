from django.urls import path

from .views import GitHubCancelView, GitHubConnectView, GitHubPollView, GitHubView

urlpatterns = [
    path("github/", GitHubView.as_view(), name="github-connection"),
    path("github/connect/", GitHubConnectView.as_view(), name="github-connect"),
    path("github/poll/", GitHubPollView.as_view(), name="github-poll"),
    path("github/cancel/", GitHubCancelView.as_view(), name="github-cancel"),
]
