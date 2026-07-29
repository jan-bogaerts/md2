---
id: F-7
title: Electron local-folder project mode
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: b1fa4c6c-d86c-4917-a5ab-85742a793cef
---

## Goal
Make the Electron application open a local project folder containing a Git repository and use that folder as the authoritative source for every project operation. GitHub repository opening remains a browser-app workflow; a GitHub remote in the selected local repository is handled through normal local Git commands.

## Current state
Most of the local implementation already exists. `LocalGitStorageService` routes file, config, branch, commit, push and watch operations through `window.md2Data`; Electron also runs actions, agents and diffs against `project.rootPath`.

The project-opening boundary is inconsistent:
- Electron exposes a native folder picker through a dedicated `md2-data:open-project-folder` IPC channel. That path returns a raw string and overrides the generic `openProjectFolder` bridge method, although React expects a `ProjectReference`.
- `local_bridge_dispatch.js` already has the correct flow for converting a selected path into a local project, validating it and establishing the current Electron project, but the renderer does not reach that flow.
- The Electron project dialog still defaults to GitHub and treats Local as an optional source. The existing desktop config value `projectLocationMode: 'folder'` is not consumed by the React project-opening flow.
- A locally selected branch is recorded in the React project reference without checking it out first. The displayed branch can therefore disagree with the files in the working tree.
- Repository validation only checks for a `.git` directory, which rejects valid Git worktrees where `.git` is a file and does not normalize a nested selection to its repository root.

## implementation details
- Treat the presence of the trusted Electron data bridge as desktop local-folder mode. In this mode, the Open Project command opens the native folder picker directly; do not offer GitHub or remote project sources in the Electron open flow.
- Keep browser behavior unchanged: without the Electron bridge, projects can still be opened through GitHub or remote control.
- Route `openProjectFolder` through the existing local bridge dispatcher. Remove the duplicate picker result path that returns a raw string, so the renderer always receives a validated `ProjectReference`.
- Resolve the selected folder with Git (`git rev-parse --show-toplevel`) and require a valid work tree. Normalize the returned `rootPath` and `id` to the repository root. A selection outside a Git work tree must fail with a clear dialog error.
- Read the actual checked-out branch when creating the local project reference instead of defaulting to `main`. Define and report a clear state for a detached `HEAD`; do not label it as `main`.
- Open the currently checked-out branch immediately after folder selection. Keep branch changes in the existing branch-switch command, which must call the local checkout operation before reloading project files.
- Continue using `LocalGitStorageService` for project data. File reads and writes, project config, actions, schedules, agent logs, diffs, commits, branch changes, pushes and file watching must remain rooted under the normalized project folder.
- Use the local repository's configured Git remotes and the user's Git credential manager or SSH setup for push. Electron project opening must not require GitHub authentication or instantiate `GithubStorageService`.
- Preserve last-project restore for local projects. On startup, revalidate the stored root as a Git work tree before loading it and surface a clear error if the folder was moved, deleted or is no longer a repository.
- Do not change remote-control semantics: a browser client may still use the separate remote-control storage flow to operate through an Electron host.
- Keep path-escape validation for every filesystem operation. Folder selection grants access only to the normalized project root, not arbitrary filesystem paths.

## Edge cases and failure modes
- The user cancels the native folder picker: leave the current project unchanged and show no error.
- The selected folder is inside a repository: normalize it to the top-level repository folder.
- The selected folder is a Git worktree: accept it even when `.git` is a file.
- Git is unavailable, the folder is not a work tree, or the repository cannot be read: reject the selection with a user-visible error.
- The repository has a detached `HEAD`: report that state explicitly and do not invent a branch name.
- Checkout is blocked by uncommitted changes: preserve the working tree, keep the current project open and show Git's failure through `dialogService`.
- The stored last-project folder no longer exists: finish application startup without an open project and show the restore error.

## testing implications
- Add Electron bridge tests proving that folder selection returns a complete local project reference, validates through Git and establishes the current project used by data and action methods.
- Add Git service tests for repository-root normalization, nested selections, worktrees, non-repositories and detached `HEAD`.
- Add React tests proving that Electron mode opens a folder-only flow, does not require GitHub authentication and opens the detected current branch.
- Add regression coverage proving the renderer no longer receives a raw folder-path string and that selecting a branch cannot relabel the project without checkout.
- Keep browser GitHub and remote-control project-opening tests unchanged.

## acceptance criteria
- In Electron, Open Project shows a native folder picker and does not ask for a GitHub repository, GitHub login or remote endpoint.
- Selecting a folder in a Git work tree opens the normalized repository root and displays its actual checked-out branch.
- Selecting a non-repository folder shows a clear error and does not replace the current project.
- All project data operations and all action, agent and diff operations use files under the selected repository root through the Electron bridge.
- Branch switching performs a real local Git checkout before project content is reloaded.
- Push uses the local repository's configured remote and local Git credentials.
- The last local project restores on Electron startup after repository revalidation.
- Browser GitHub opening and browser-to-Electron remote-control opening continue to work.

## see also
- `design\feature_descriptions\ready\F_002_data_management.md`
- `design\feature_descriptions\ready\F_013_desktop_app.md`
- `design\feature_descriptions\ready\F_027_repository_branch_selection.md`
- `design\feature_descriptions\ready\B_029_desktop_bridge_security_hardening.md`
- `design\architecture\initial description\desktop app.md`
