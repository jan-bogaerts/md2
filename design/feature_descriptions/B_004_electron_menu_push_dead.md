---
id: B-004
title: electron Project→Push menu item does nothing
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`desktop/main.js` builds a native `Project → Push` application menu item that sends `md2-data:menu-push` to the renderer, and `desktop/preload.js` exposes `onMenuPush(callback)` — but no React code ever subscribes (zero consumers of `onMenuPush` in `app/src`). Clicking the menu item is a silent no-op.

The deeper issue is that the menu shouldn't exist on the Electron side at all: Electron main only hosts the window and native bridges ([[F-013]]), it shouldn't own app commands like Push. The React app needs its own unified menu, so this isn't fixable by just wiring up `onMenuPush` — the native menu item should be removed and Push should become an action inside the React menu instead.

## Fix
- Remove the native `Project → Push` menu item (and the `md2-data:menu-push` / `onMenuPush` IPC plumbing) from `desktop/main.js` and `desktop/preload.js`; Electron main stops building any app-command menu.
- Add a unified menu to the React app, structured as reusable components:
  - `Menu` — the top-level container, holds one or more `Tab`s.
  - `Tab` — a page of the menu, holds one or more `Section`s.
  - `Section` — a group of icon buttons/toggles, with its label shown below the group.
- Add a Push action as an icon button inside the appropriate section, calling `dataService.push()` and surfacing failures through the existing workspace error alert.
- Guard: only meaningful when a project is open; otherwise disable the button or show a hint.

## acceptance criteria
- Electron main no longer builds a native app-command menu; `md2-data:menu-push` and `onMenuPush` are removed.
- `Menu`, `Tab` and `Section` exist as standalone, reusable React components; a `Section` renders its label below its icon buttons/toggles.
- With a local project open and pending commits, clicking Push in the React menu pushes (verified through a mocked bridge asserting `push` is called).
- Push failures appear in the workspace error alert.
- With no project open, the Push button is disabled or otherwise guarded against a no-op click.

## see also
- `design\feature_descriptions\F_013_desktop_app.md`
- `design\feature_descriptions\F_004_app_layout.md`
