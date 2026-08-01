---
author: 
id: F_66
internalId: fb3a7428-2f7d-48dd-beda-ce7279c516e7
title: Project in appbar
status: ready
owner: 
affects:
agents:
policy:
after: 964fdcac-159c-49dc-af83-79f532e9651d
---

# Goal

Show the project folder name (not entire path) in the app bar so users know which project is open

# Current state

- `MainToolbar` renders the application icon, menu tabs, responsive actions, theme control, and search, but no project identity.
- The active `ProjectReference` is owned by `ProjectState`, exposed by `DataService.getState()`, and available to React through `useProjectState()`.
- Local and remote project references identify the folder through `rootPath`; GitHub project references identify it through `repository`. The app bar currently exposes neither value.

# implementation details

- Add a leaf component beside the application icon in `MainToolbar` that subscribes to `useProjectState()` and renders the active project name. Keep the subscription in this component so project changes do not add state plumbing through the shell.
- For local and remote projects, normalize both `\` and `/` separators, ignore trailing separators, and use only the final `rootPath` segment. For GitHub projects, use `repository`.
- Render nothing when no project is open. A loaded project reference without the source field required to derive its name must fail with a clear error rather than display an id or full path as a fallback.
- Use the existing toolbar typography and theme values. Keep the label on one line and truncate it with an ellipsis when toolbar space is limited; do not expose the full path in the app bar.
- Preserve the Electron drag region: the non-interactive project label remains draggable and introduces no new `NO_DRAG_REGION`.
- Add focused tests for name derivation, project changes, the no-project state, and constrained toolbar rendering.

# acceptance criteria

- Opening a local or remote project shows only the final folder name in the app bar, for both Windows and POSIX-style paths.
- Opening a GitHub project shows its repository name in the app bar.
- The full project path and project id are not displayed.
- Switching projects updates the displayed name without restarting or reopening the shell.
- No project label is shown when no project is open.
- Long project names remain on one line and truncate without displacing the toolbar controls.
- The project label does not prevent dragging the Electron window.
