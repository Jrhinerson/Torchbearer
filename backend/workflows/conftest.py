from importlib import import_module

import pytest
from django.apps import apps
from django.db import connection
from rest_framework.test import APIClient


@pytest.fixture
def catalogue(db):
    # Transactional tests elsewhere flush seed rows, so restore missing catalogue entries.
    migration = import_module("workflows.migrations.0002_seed_catalogue")
    migration.seed_catalogue(apps, connection.schema_editor())
    migration = import_module("workflows.migrations.0003_consolidate_workflows")
    migration.consolidate_catalogue(apps, connection.schema_editor())
    migration = import_module("workflows.migrations.0005_plan_execute_graph")
    migration.seed_graph(apps, connection.schema_editor())


@pytest.fixture
def client():
    return APIClient(enforce_csrf_checks=True)
