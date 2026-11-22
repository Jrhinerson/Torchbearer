# Browse local projects in an explorer

Status: Implemented and verified locally on `feat/project-folder-explorer`.

Base: local `main`. No prerequisite commits outside this change. Commit locally only.

## Commit 1: `feat: enrich local folder browsing with explorer metadata`

- **Frontend:** Extend the folder-listing types with breadcrumbs, location shortcuts, and repository markers for the explorer.
- **Backend:** Return visible child folders, Git checkout/worktree markers, breadcrumbs, and available home/common-folder/drive shortcuts. Skip unreadable entries and cover navigation metadata and access failures.
- **Database:** No changes.

## Commit 2: `feat: select local projects through a folder explorer`

- **Frontend:** Open a focused explorer dialog directly when adding a local project, with breadcrumbs, shortcuts, folder filtering, repository markers, and explicit selection. Keep manual path entry optional, preserve clone destination browsing and task drafts, and verify keyboard, failure, and narrow-screen behavior.
- **Backend:** No changes.
- **Database:** No changes.

## Acceptance criteria

- Add Project opens the local explorer without requiring an exact path.
- Users can navigate through shortcuts, child folders, breadcrumbs, and the parent folder, then choose the current folder.
- Git repositories appear first and have a visible marker; ordinary folders remain selectable.
- Manual path entry is available as an optional shortcut.
- Choosing or cancelling a folder preserves the task draft and existing project selection.
- Loading and access errors prevent stale folder selection and allow retry/navigation.
- Clone destination browsing continues to work, and the explorer fits narrow viewports.
- Run API checks, frontend static/build checks, and relevant Chromium integration checks before committing locally.

## Verification

- All 146 backend tests pass, including 48 project API tests. Tests use a fresh short `--basetemp` and disable the cache provider to avoid existing Windows temporary/cache directory permissions.
- All 37 Chromium integration tests pass on dedicated ports 18543/18544 with disposable data, including 10 project tests. Coverage includes choosing a repository without typing a path, checkout/worktree markers, filtering, breadcrumbs and parent navigation, keyboard focus, cancellation, access-error recovery, pending selection guards, clone flows, and existing workflow regressions.
- Desktop (1280px) and narrow (390px) explorer screenshots were visually inspected. The explorer uses a focused native dialog to keep its list and selection controls accessible above the task composer.
- Python lint/format, Django system checks, migration consistency, frontend formatting/lint, TypeScript, and the production build pass.
- Restart persistence verification passes for the task, saved project, and association using a disposable database. No schema migrations were added.
