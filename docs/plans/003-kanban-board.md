# Kanban board and task popup

Status: Implemented and verified locally. All 7 browser tests, frontend formatting/linting, TypeScript checks, and the production build pass. The board and popup were checked in the shared browser; the local app remains running.

## Commit 1: `feat: present the workflow as a kanban board`

- **Frontend:** Remove the introductory copy and fixed task form, and display Backlog, Plan, Integrate, Test, and Final Approval as horizontal board columns. Open task creation in a modal from a New Task button inside Backlog, retaining task deletion and adding browser coverage for dialog behavior and responsive layout.
- **Backend:** No changes.
- **Database:** No changes.

## Acceptance criteria

- The three annotated introductory elements are removed.
- All five stages appear in the requested order, with new tasks in Backlog.
- A New Task button inside Backlog opens the form as a popup.
- The popup focuses its title field, supports Cancel and Escape, and restores focus when closed.
- Failed creation keeps the popup and draft visible; successful creation closes it and updates the board.
- Task deletion still supports confirmation, failure recovery, and persistence.
- The board scrolls horizontally on narrow screens without making the entire page overflow.
- Verify the annotated page in the shared browser, run appropriate checks, and commit locally only.
