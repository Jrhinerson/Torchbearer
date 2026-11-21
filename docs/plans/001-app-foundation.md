# First PR: Local application foundation

Status: Proposed. Application implementation has not begun.

Proposed PR title: `Scaffold local app with SQLite-backed backlog`

Proposed feature branch: `feat/app-foundation`

## Outcome and scope

A developer can start the local application, create a backlog task through React, and retrieve it after refreshing the page or restarting Django. SQLite is persistent local storage; the database file is excluded from Git.

Use React with TypeScript and Vite, Python with Django 5.2 LTS and Django REST Framework, and SQLite through Django's models and migrations. Use the installed Python 3.14, pin resolved dependencies, and commit dependency locks or complete pinned dependency files.

The repository currently has no commits or remote. Configure the intended Git host and repository, establish the baseline below on `main`, and then create the feature branch. The hosting destination is required before pushing and opening the PR, but does not prevent local implementation.

## Prerequisite commit outside the PR

### 0. `docs: initialize project guidance and foundation plan`

- **Frontend:** No changes.
- **Backend:** No changes.
- **Database:** No changes.

Commit the project planning instructions, this plan, and a minimal README describing Torchbearer's purpose and agreed stack. This establishes the base commit against which the first PR can be reviewed.

## Commits in the PR

### 1. `chore: scaffold React and Django applications`

- **Frontend:** Create the React, TypeScript, and Vite application under `frontend/`, with a minimal Torchbearer shell and an API proxy to the local Django service. Pin dependencies and establish formatting, linting, and type-check commands.
- **Backend:** Create the Django project under `backend/` with Django REST Framework, isolated Python dependencies, and a health endpoint. Keep local configuration explicit and bind development services to localhost.
- **Database:** Configure SQLite at a configurable path with an ignored local data directory as the development default. Include instructions for applying Django's built-in migrations and exclude database files from Git.

### 2. `feat: add SQLite-backed backlog task API`

- **Frontend:** No changes.
- **Backend:** Add create and list task endpoints, input validation, and tests for their behavior. Keep task status controlled by the backend and explicitly enforce and test CSRF protection for local write requests, including anonymous requests.
- **Database:** Add the initial Task model and migration with an ID, title, description, backlog status, and creation and update timestamps. Creating a task records proposed work without granting approval to execute it.

### 3. `feat: add backlog screen and task creation`

- **Frontend:** Build a Backlog column and task form connected to the Django API. Display persisted tasks and provide clear empty, loading, validation-error, and connection-error states.
- **Backend:** No changes.
- **Database:** No changes.

### 4. `chore: add repeatable local development commands`

- **Frontend:** Add a documented development command that starts the interface and local backend together and stops both on exit. Keep frontend installation and build commands available independently.
- **Backend:** Add Windows-compatible setup and startup commands with clear prerequisite and failure messages. Document configuration and make the commands use the project's isolated Python environment.
- **Database:** Add a documented setup command that applies pending migrations to the configured local database. Normal startup must preserve existing tasks and must not reset or seed over user data.

### 5. `test: verify task creation and persistence`

- **Frontend:** Add focused Playwright coverage for creating a task and seeing it after a page reload. Verify that failed creation produces a useful message instead of a misleading success state.
- **Backend:** Complete API tests for creating and listing tasks, rejecting blank titles, protecting writes, and preventing client-assigned workflow status. Document and perform a manual restart check to distinguish database persistence from a frontend-only reload.
- **Database:** Use isolated SQLite databases for automated tests and verify that saved tasks can be retrieved in a subsequent request. Document how to confirm that a task survives a Django process restart without touching the developer's real data during tests.

### 6. `ci: validate and document the application foundation`

- **Frontend:** Run reproducible dependency installation, linting, type checking, the production build, and the browser integration checks in CI for the selected Git host. Document the frontend layout and its API boundary in the README and architecture notes.
- **Backend:** Run Python linting, Django system checks, and API tests in CI. Document setup, verification commands, and the future boundary between workflow rules and the local agent runner.
- **Database:** Check that migrations apply to a fresh SQLite database and that model changes have no missing migrations. Document the database location, configuration, and how local data is kept out of Git.

## Proposed layout after implementation

```text
Torchbearer/
|-- AGENTS.md
|-- README.md
|-- frontend/
|   |-- src/
|   |   |-- app/
|   |   |-- features/tasks/
|   |   `-- lib/
|   `-- package.json
|-- backend/
|   |-- config/
|   |-- tasks/
|   `-- manage.py
|-- tests/e2e/
|-- scripts/
`-- docs/
    |-- architecture.md
    `-- plans/001-app-foundation.md
```

## Acceptance criteria

- A fresh checkout can be installed, migrated, started, and verified using the documented commands, including on Windows.
- The React interface creates and lists tasks through Django rather than storing them only in browser state.
- Tasks remain after a page refresh and a Django restart.
- Invalid input produces useful feedback and leaves the database unchanged.
- Clients cannot set a task's workflow status during creation.
- Write requests have explicitly tested CSRF protection.
- Frontend builds, linting, type checks, Django checks, migration checks, API tests, and browser tests pass.
- Local databases, environment files containing secrets, dependency directories, and generated build files are excluded from Git.
- The PR description explains the resulting behavior, setup, and validation performed.

## Follow-up scope

Subsequent PRs will define human decision checkpoints, allowed task transitions, approvals tied to revisions, decision history, agent integrations, drag-and-drop transitions, and desktop packaging. Agent execution is not part of this foundation PR.

## Framework references

- Django support schedule: https://www.djangoproject.com/download/
- Django 5.2 and Python compatibility: https://docs.djangoproject.com/en/5.2/faq/install/
- Django REST Framework: https://www.django-rest-framework.org/
