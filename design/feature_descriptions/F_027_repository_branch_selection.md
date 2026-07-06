---
id: F-027
title: repository and branch selection
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Replace the free-text owner/repo/branch fields with real selection flows: pick a repository from the authenticated user's repositories, pick/switch a branch from an actual branch list ("allow switch branch from menu"), and ask the user which folder to use when the configured working folder is missing.

## Current state
`ProjectWorkspace` opens GitHub projects from three plain `TextField`s (owner, repository, branch) and switches branches by typing a name. `listBranches` is fully implemented in `GithubStorageService`, `LocalGitStorageService` and the Electron bridge but has **no UI consumer**. `GithubStorageService.findRepository` exists but is also unused. When the configured working folder does not exist, `createProject`/`loadProject` silently create it with a README instead of asking the user which folder to use (`data management.md`).

## implementation details
- Add a repository picker for GitHub mode: list the user's repositories (GET `/user/repos`, paged) with a text filter; keep a manual owner/repo entry as fallback for repos not listed.
- After choosing a repository (or local folder), populate a branch dropdown from `listBranches` and preselect the default/current branch; branch switching uses the same dropdown, not free text.
- Move open/create project and branch/push controls out of the always-visible workspace header into a project menu/dialog (see B-019), keeping them reachable from the toolbar.
- Working-folder resolution on open: if the configured folder is missing, show a chooser listing the repo's top-level folders with options "use folder X", "create '{configured}' from template". Only create the template after explicit confirmation.
- Persist the chosen working folder into the project config (`md2.config.json`) so the question is asked once per project.
- Handle API failures (rate limit, permissions) with clear errors and keep manual entry usable.

## acceptance criteria
- Opening a GitHub project offers a filterable repository list for the signed-in user.
- Branches are chosen from a dropdown fed by `listBranches` in both GitHub and local modes; switching branches reloads the project.
- When the working folder is missing, the user is asked to pick an existing folder or create the configured one from the template; nothing is created without confirmation.
- The chosen working folder is stored in project config and reused on the next open.
- Repository/branch listing failures show clear errors and manual entry still works.
- Tests cover repository listing/filtering, branch dropdown population, the missing-folder chooser and config persistence.

## see also
- `design\architecture\initial description\data management.md`
- `design\feature_descriptions\F_002_data_management.md`
