# Saved projects in task creation

Reference: T3 Code's [project creation](https://github.com/pingdotgg/t3code/blob/main/docs/user/source-control.md#start-clone-or-publish-a-project), [add-project UI](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/CommandPaletteAddProject.tsx), and [project settings](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/settings/ProjectsSettings.tsx).

Save projects once, then select them when creating tasks. Support existing local folders and cloning a Git URL into a new local destination. Keep the task draft while adding or managing projects. Projects may be renamed or removed from the picker without deleting their files or existing tasks. Tasks without a project remain supported.

No prerequisite commits outside this change.

## Commit 1: `feat: persist reusable projects and task associations`

- **Frontend:** No changes.
- **Backend:** Add persistent project registration, directory browsing, Git URL cloning, rename and removal APIs with validation and CSRF protection. Include project details in task responses and reject new associations with removed projects.
- **Database:** Add a project model with a unique canonical local folder and an archive flag for removal. Add an optional project association to tasks without changing existing rows.

## Commit 2: `feat: add project selection and management to new tasks`

- **Frontend:** Add a searchable project picker and local-folder/clone flows inside New Task, plus rename/remove controls and project labels on task cards. Cover persistence, draft retention, failures, keyboard use and narrow screens; document the workflow.
- **Backend:** No changes.
- **Database:** No changes.

## Acceptance criteria

- New Task supports searching and selecting a saved project, or continuing without one.
- Add Project supports browsing or pasting an existing local folder, and cloning an HTTPS/SSH Git URL to a new local folder.
- Adding a project selects it without discarding the task title or description.
- Invalid folders, duplicate projects and failed clones show actionable errors; existing destinations are never overwritten.
- Renaming a project updates its picker entry and existing task labels.
- Removing a project hides it from future selection while preserving files and associated tasks; adding its folder again restores it.
- Project selection survives closing and reopening the task draft, and saved associations survive a backend restart.
- Existing tasks and task creation without a project continue to work.
- Run portable checks, restart persistence verification and Chromium integration checks; commit locally only.
