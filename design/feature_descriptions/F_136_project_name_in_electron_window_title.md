---
author: 
id: F_136
internalId: 4aa237a7-a946-4ce7-84ba-962826a44dfa
title: project name in electron window title
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__4aa237a7-a946-4ce7-84ba-962826a44dfa.json#conversation=agent-fbb8c5ed-f874-4efa-a462-017bd6519a18
  - design/activity/card__4aa237a7-a946-4ce7-84ba-962826a44dfa.json#conversation=agent-51667e03-d5b6-441f-b3cb-7a29d4ec3c82
policy:
after: f63b1866-ff7a-4fe9-b984-06cf1284f74e
branch: f_136_project_name_in_electron_window_title
worktree: 1
---
Put the project name in the electron window title so that users can easily see which project is opened in which instance when hovering the mouse over the windows taskbar

## Current state

- `app/index.html` sets the page title to `MD²`. `desktop/main.js` creates `BrowserWindow` without a fixed `title`, so Electron mirrors this page title into the native window title and Windows taskbar hover text.
- Active `ProjectReference` state is owned by `ProjectState`, exposed by `DataService.getState()`, and available through `useProjectState()`.
- `projectName()` already returns the repository name for GitHub projects or the final `rootPath` folder for local and remote projects. `ProjectNameLabel` uses it in the app bar, but no component updates the window title.

## implementation details

- Add `ProjectWindowTitle` as a leaf component in its own file and mount it from `App`. It subscribes through `useProjectState()` so opening, switching, restoring, or closing a project updates the title without state plumbing through layout components.
- In an effect, set `document.title` to `<project name> — MD²` while a project is open. Electron mirrors `document.title` to `BrowserWindow`; no new IPC or preload bridge is needed.
- Set `document.title` to `MD²` when no project is open and restore that value during effect cleanup. Browser builds receive the same tab title because Electron and browser modes share the renderer.
- Reuse `projectName()` unchanged. Its existing app-bar call site keeps current behavior; the new title component receives the same source-specific name derivation. Do not expose a full path or project id.
- Derive and assign the title inside the effect, not during render. If required project data is missing, report the `projectName()` error through `dialogService` and restore `MD²` as safe title.
- Add focused component tests for initial no-project state, local and GitHub names, project switching, project closing, cleanup, and invalid project data. Tests must restore the original `document.title` after each case.

## acceptance criteria

- With no project open, Electron window title is `MD²`.
- After opening or restoring a project publishes its `DataService` state change, the next React effect sets title to `<project name> — MD²`.
- Local and remote projects use only final folder name from `rootPath`; GitHub projects use repository name. Full path and project id never appear in title.
- Switching projects updates title without restarting window. Closing project restores `MD²`.
- Windows taskbar hover text shows updated title, allowing simultaneous MD² windows to be distinguished.
- Browser mode remains functional and uses same project-aware page title.
- Missing required project-name data produces a `dialogService` error and leaves safe `MD²` title instead of throwing during React render.
