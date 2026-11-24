# Project instructions

## Git workflow

- Commit locally only. The user handles pushing to GitHub and opening pull requests after their own approval.
- Do not push branches, create remote repositories, or open pull requests.

## Worktree setup

- Every Git worktree must have its own `.venv/` directory with Django and all pinned backend dependencies installed in that environment.
- Run `python scripts/setup.py` from each new worktree to install its dependencies and apply migrations. Do not use another checkout's `.venv` or `PYTHONPATH` as a substitute for completing that worktree's setup.

## Planning format

- Break every project plan into an ordered sequence of proposed Git commits.
- Give each commit a clear proposed commit message.
- For every commit, include three explicitly labeled summaries: **Frontend**, **Backend**, and **Database**.
- Keep each summary to one or two concise sentences explaining what changes and its purpose.
- If a commit does not change an area, write **No changes.** for that area instead of omitting it.
- Identify any prerequisite commits outside the PR and use the same summary format for them.
- Keep commits focused, independently reviewable, and ordered by their dependencies.
