"""Settings for Torchbearer's local development service."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = Path(os.environ.get("TORCHBEARER_DATA_DIR", PROJECT_DIR / ".local")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
TORCHBEARER_RUN_TIMEOUT = max(1, int(os.environ.get("TORCHBEARER_RUN_TIMEOUT", "1800")))

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "torchbearer-local-development-key-only")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
FRONTEND_PORT = int(os.environ.get("TORCHBEARER_FRONTEND_PORT", "5173"))
CSRF_TRUSTED_ORIGINS = [f"http://127.0.0.1:{FRONTEND_PORT}", f"http://localhost:{FRONTEND_PORT}"]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
    "projects",
    "tasks",
    "workflows",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]
ROOT_URLCONF = "config.urls"
CSRF_FAILURE_VIEW = "config.views.csrf_failure"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "torchbearer.sqlite3",
        "OPTIONS": {"timeout": 10, "transaction_mode": "IMMEDIATE"},
    }
}
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
