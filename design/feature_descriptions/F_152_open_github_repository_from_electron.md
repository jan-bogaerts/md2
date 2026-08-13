---
author: 
id: F_152
internalId: 56f68e51-66b5-4b47-9cf2-6a47128a0cb6
title: open github repository from electron
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__56f68e51-66b5-4b47-9cf2-6a47128a0cb6.json#conversation=agent-5cd5e295-50f9-4601-b85f-b778fe8ab5f7
policy:
after: a57b89e0-49f4-4c25-9d99-deea222460cd
branch: f_152_open_github_repository_from_electron
worktree: 2
---
When the react app is running in the electron environment, it defaults to opening projects by selecting a folder.

When the react app is connected through a remote connection (websockets), the app is able to open a repository, but only from the user's own account.

* it should  be possible to open public repositories as read-only
* it should always be possible to open a repository from github.

We need to add an 'open dialog' to support this feature. from this dialog, the user can always choose between personal or public repository, and when running in the electron environment, the user can also select a folder.

To select a folder:

* text input, with button at end of input (use the MUI components for this so the button is inlined) to select the folder with the os dialog.
* below that, a list of previously selected folders. if clicked, this is opened

so app must track last 5 unique folders that were opened

## Current state

- Electron bypasses `ProjectOpenDialog`: `useProjectToolbarMenuActions` immediately calls `openProjectFolder`, and Electron's main process shows a native directory picker. No typed path or recent-folder list exists.
- Browser mode opens `ProjectOpenDialog`. Authenticated GitHub repositories come from `/user/repos`; manual owner/repository lookup and branch selection use `GithubStorageService`. Remote WebSocket projects use `RemoteControlStorageService`.
- GitHub controls are hidden in Electron even though GitHub auth and storage run in the React app. Manual GitHub fields are disabled without authentication.
- All GitHub projects are writable. Project session and storage types carry no read-only state, so editors, card operations, actions, configuration saves, releases, and push controls cannot distinguish public read-only projects.
- A missing `md2.config.json` currently leads to project creation. During normal loading, missing config is also generated and saved. Both paths conflict with opening arbitrary public repositories read-only.
- Last opened project is stored in `localStorage`, but no recent local-folder history exists.

## implementation details

- Always open `ProjectOpenDialog` from project-open commands. Keep remote WebSocket source available in browser mode. Offer these GitHub choices in every environment: **Personal repository** and **Public repository**. Add **Local folder** only when Electron bridge exists.
- Personal repository keeps current authenticated `/user/repos` list, manual filtering, branch selection, and writable `github` storage. Public repository requires GitHub authentication, accepts owner and repository, verifies GitHub reports public visibility, loads branches through existing manual lookup, and opens with a distinct read-only GitHub storage type.
- Define read-only as: repository content may be loaded, browsed, searched, diffed, and viewed on another branch; no repository file, config, card, activity, commit, or GitHub branch reference may be changed, and no action may run. A branch reference is GitHub's stored pointer from a branch name to a commit. Persist storage type with last-project data so restart restores same access mode.
- Expose read-only state from `ProjectSessionService`. Disable mutating UI at smallest owning components, including editors, card creation/status/order changes, file operations, project-config save, actions, release completion, commit, and push. Guard corresponding service operations too, so non-UI callers cannot write.
- Make `GithubStorageService` enforce read-only mode at its write boundary. Read methods remain shared. Every write method fails fast with a clear read-only error; do not rely only on disabled controls.
- For read-only GitHub projects without `md2.config.json`, load `DEFAULT_PROJECT_CONFIG` in memory. Do not show project setup and do not save generated config. Missing default actions, working, archived, or history folders behave as empty folders; no folder or file is created.
- Add Local folder UI as a MUI `TextField` with end-adornment folder button. Picker cancellation leaves dialog open and does not change history. Typed paths and recent-folder clicks use existing Electron project resolution, which validates Git work tree and returns canonical repository root—the absolute top-level path reported by Git—and checked-out branch before project loading.
- Store recent local repository roots in `localStorage`, newest first. Record only successful opens, move reopened root to front, compare Windows paths case-insensitively, and keep at most five unique canonical roots. Invalid stored data becomes an empty list; a failed open reports through `dialogService` and does not change history.
- Keep missing-config setup behavior unchanged for writable personal GitHub and local projects. Keep remote WebSocket open flow unchanged.
- Add tests for dialog source availability, local input/picker/history behavior, public default-config loading, read-only restoration and write guards, disabled mutation controls, and unchanged personal/local/remote behavior. Update Electron bridge tests only where dialog-based folder selection changes call timing.

## acceptance criteria

- Opening project shows one dialog in Electron and browser environments; Electron no longer launches native folder picker before user chooses Local folder.
- Signed-in user can open personal GitHub repository with current write behavior from Electron or browser.
- Signed-in user can enter any accessible public owner/repository, select branch, and open it read-only from Electron or browser.
- Public repository without `md2.config.json` opens with default folder configuration without writing config or creating folders. Absent default folders appear empty.
- Public read-only project supports browsing, search, diffs, and branch selection. Mutating controls are unavailable, actions cannot run, and direct service write attempts fail with clear read-only error.
- Restart restores public project as read-only; it never becomes writable because last-project data was reloaded.
- Electron user can type folder path, choose one with inline OS-picker button, or click recent folder. Each path resolves to Git repository root before opening.
- Recent-folder list contains at most five successfully opened unique canonical roots in newest-first order. Reopening moves root to top; cancellation or failure leaves list unchanged.
- Invalid folder, inaccessible GitHub repository, and loading errors remain in open dialog and are reported through `dialogService`.
- Existing writable local, writable personal GitHub, and remote WebSocket project flows retain current behavior.
