from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import generics, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .cli import agent_catalog
from .models import ColumnAssignment, Repository, Task
from .serializers import RepositorySerializer, TaskSerializer


@method_decorator(csrf_protect, name="dispatch")
class LocalView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RoutingView(LocalView):
    def get(self, request):
        assignments = dict(ColumnAssignment.objects.values_list("stage", "agent"))
        return Response(
            {
                "agents": agent_catalog(),
                "assignments": {
                    stage: assignments.get(stage, "") for stage in ColumnAssignment.Stage
                },
            }
        )


class AssignmentView(LocalView):
    def patch(self, request, stage):
        if stage not in ColumnAssignment.Stage.values:
            raise serializers.ValidationError("Only Plan, Integrate, and Test can run agents.")
        agent = request.data.get("agent")
        if agent not in ["", *ColumnAssignment.Agent.values]:
            raise serializers.ValidationError("Choose a supported agent or Unassigned.")
        ColumnAssignment.objects.update_or_create(stage=stage, defaults={"agent": agent})
        return Response({"stage": stage, "agent": agent})


@method_decorator(csrf_protect, name="dispatch")
class RepositoryListView(generics.ListCreateAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Repository.objects.all()
    serializer_class = RepositorySerializer


@method_decorator(csrf_protect, name="dispatch")
class TaskListCreateView(generics.ListCreateAPIView):
    """Local task inbox. CSRF applies even when there is no authenticated user."""

    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Task.objects.all()
    serializer_class = TaskSerializer


@method_decorator(csrf_protect, name="dispatch")
class TaskDeleteView(generics.RetrieveUpdateDestroyAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Task.objects.all()
    serializer_class = TaskSerializer

    def patch(self, request, *args, **kwargs):
        if set(request.data) != {"repository"} or self.get_object().status != Task.Status.BACKLOG:
            raise serializers.ValidationError("Only a backlog task's repository can be changed.")
        return self.partial_update(request, *args, **kwargs)

    def put(self, request, *args, **kwargs):
        return Response(status=405)
