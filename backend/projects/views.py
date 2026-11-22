from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project
from .serializers import AddProjectSerializer, ProjectSerializer
from .services import browse_folders


@method_decorator(csrf_protect, name="dispatch")
class ProjectListCreateView(generics.ListCreateAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Project.objects.filter(archived=False)
    serializer_class = ProjectSerializer

    def create(self, request, *args, **kwargs):
        serializer = AddProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = serializer.save()
        return Response(ProjectSerializer(project).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    http_method_names = ["get", "patch", "delete", "head", "options"]
    queryset = Project.objects.filter(archived=False)
    serializer_class = ProjectSerializer

    def perform_destroy(self, instance):
        instance.archived = True
        instance.save(update_fields=["archived", "updated_at"])


@method_decorator(csrf_protect, name="dispatch")
class FolderBrowseView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    # A POST keeps local directory listings behind CSRF validation too.
    def post(self, request):
        path = (
            serializers.CharField(max_length=4096).run_validation(request.data["path"])
            if "path" in request.data
            else None
        )
        return Response(browse_folders(path))
