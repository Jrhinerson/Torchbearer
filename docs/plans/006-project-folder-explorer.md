# Browse local projects in an explorer

Base: local `main`. No prerequisite commits outside this change. Commit locally only.

## Commit 1: `feat: enrich local folder browsing with explorer metadata`

- **Frontend:** Extend the folder-listing types with breadcrumbs, location shortcuts, and repository markers for the explorer.
- **Backend:** Return visible child folders, Git checkout/worktree markers, breadcrumbs, and available home/common-folder/drive shortcuts. Skip unreadable entries and cover navigation metadata and access failures.
- **Database:** No changes.

## Commit 2: `feat: select local projects through a folder explorer`

- **Frontend:** Open a navigable explorer directly when adding a local project, with breadcrumbs, shortcuts, folder filtering, repository markers, and explicit selection. Keep manual path entry optional, preserve clone destination browsing and task drafts, and verify keyboard, failure, and narrow-screen behavior.
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
