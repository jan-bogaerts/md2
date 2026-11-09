---
author: 
id: B_352
internalId: cf8beb58-a0c5-4116-a93f-a3d52a377175
title: no longer possible to open another project
status: ready
owner: 
affects:
agents:
  - design/activity/card__cf8beb58-a0c5-4116-a93f-a3d52a377175.json
policy:
changedFiles:
  - app/src/data/commit_batcher.test.ts
  - app/src/data/commit_batcher.ts
  - app/src/services/project/project_loading.test.ts
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/agent/agent_conversation_persistence.js
  - desktop/src/actions/agent/project_agent_token_usage.js
  - desktop/src/actions/agent/project_agent_token_usage.test.mjs
  - desktop/src/git/git_commands.js
  - desktop/src/git/git_commands.test.mjs
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
  - desktop/src/project/uncommitted_project_writes.js
  - desktop/src/project/uncommitted_project_writes.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
after: 3d19a862-9a99-47bf-a7f3-0d9249ecdb88
---

Started md2 in debug mode, opened a project automatically, wanted to open another project, got this error:

> Command failed: git check-ignore -z -- design/active/F_5_sphere_defense_cv.md design/usage_metrics.csv
> fatal: -z only makes sense with --stdin

can no longer open another project.

also, what is the purpose of the git command when opening a project?

## Current state

Opening another project first flushes pending changes from the current project. Local persistence calls `listIgnoredPaths`, which runs `git check-ignore -z -- <paths>`. Git only accepts `-z` with `--stdin`, so the flush fails before the new project starts loading.

The ignored-path query was added for the local-only project-folder feature. It runs for normal commits regardless of `includeProjectFolderInGit`, making Git ignore rules a second source of truth for persistence. The project configuration already identifies the local-only folder and must be authoritative. `.gitignore` is only the matching repository safeguard.

The existing tests mock the Git process and assert the invalid arguments, so they do not exercise the real Git command.

## Implementation details

- Remove `listIgnoredPaths` and `git check-ignore` from normal save, move, setup, pending-write, and project-switch persistence paths.
- Partition pending changes using `includeProjectFolderInGit` and `projectFolder`. Write local-only paths to disk without staging, committing, or pushing them. Commit the remaining paths normally, including when one batch contains both kinds.
- Apply the same configuration policy to desktop-generated project files, including activity files and `usage_metrics.csv`, before registering them as uncommitted Git writes.
- Keep Git operations only for changing the setting: maintain the MD² `.gitignore` block, detect tracked project-folder files, and remove confirmed files from the index.
- Replace mocked command assertions with regression coverage using a temporary Git repository. Add focused coverage for mixed batches and switching projects with pending changes.

## Acceptance criteria

- A project with pending changes can open another project without running `git check-ignore` or reporting a Git error.
- With `includeProjectFolderInGit` enabled, pending project-folder changes, activity files, and usage metrics are committed before switching projects.
- With `includeProjectFolderInGit` disabled, project-folder changes are written locally and are not staged, committed, or pushed.
- A mixed batch writes local-only project-folder files and commits only files outside that folder.
- Changing the setting still updates the MD²-managed `.gitignore` block and handles already tracked project-folder files through the existing confirmation flow.
- A real-Git regression test fails with the previous command and passes with the corrected persistence flow.
