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

## Follow-up commit: `refactor: move task configuration off board cards`

This follows the two explorer commits above; no additional prerequisites are needed.

- **Frontend:** Remove inline routing and repository editors from task cards, including Edit routing and Add repository. Open Backlog settings through the task title, retain initial routing configuration for legacy tasks in review dialogs, and verify saving, focus restoration, and existing workflow actions.
- **Backend:** No changes.
- **Database:** No changes.

Verification: all 38 Chromium tests pass, including routing/repository edits through settings, error recovery, reload persistence, keyboard focus restoration, legacy routing recovery, and the full reviewed workflow. Frontend formatting, lint, TypeScript, and production build pass. The shared preview confirms zero inline fields on the card and a working settings dialog from its title.

## Follow-up commit: `feat: make task cards collapsible`

This follows the existing card-settings commit; no additional prerequisites are needed.

- **Frontend:** Add an accessible per-card toggle that hides everything except the title and project when collapsed, with “No project” for unassigned tasks. Keep cards initially expanded, preserve each card's state during board refreshes, and verify keyboard toggling, independent cards, settings access, and narrow screens.
- **Backend:** No changes.
- **Database:** No changes.

Verification: all 18 board/styling browser checks pass. After tightening long project-name wrapping, the two collapse checks pass again at 1280px and 390px; screenshots were visually inspected. Frontend formatting, lint, TypeScript, and production build pass.

## Follow-up commit: `style: use trash and torch icons`

This follows the existing card-collapse commit; no additional prerequisites are needed.

- **Frontend:** Replace the Delete text with a trash SVG and the header's “t” with a torch silhouette. Inherit theme colors and preserve the delete button's accessible name, tooltip, pending state, confirmation, and 44-pixel click target.
- **Backend:** No changes.
- **Database:** No changes.

Verification: all 18 existing board/styling browser checks pass, including deletion cancellation, persistence, and failure recovery. Frontend formatting, lint, TypeScript, and production build pass. Both icons were visually checked in the shared preview, and the delete button retains its accessible name and 44-by-44-pixel target.

## Follow-up commit: `fix: default task cards to collapsed`

This follows the existing icon commit; no additional prerequisites are needed.

- **Frontend:** Track expanded card IDs so all cards default to collapsed on page load/reload and creation, while manual expansion survives automatic polling and stage changes. Update existing browser checks to expand cards before using their actions and verify that reloading resets expansion.
- **Backend:** No changes.
- **Database:** No changes.

Verification: all 40 Chromium tests pass, including desktop/mobile initial collapse, reload reset, expansion during polling, settings access, deletion, project selection, and stage transitions. Frontend formatting, lint, TypeScript, and production build pass.
