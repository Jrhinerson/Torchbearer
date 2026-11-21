from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import generics
from rest_framework.permissions import AllowAny

from .models import Task
from .serializers import TaskSerializer


@method_decorator(csrf_protect, name="dispatch")
class TaskListCreateView(generics.ListCreateAPIView):
    """Local task inbox. CSRF applies even when there is no authenticated user."""

    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
