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
`desktop/main.js` builds a `Project → Push` menu item that sends `md2-data:menu-push` to the renderer, and `desktop/preload.js` exposes `onMenuPush(callback)` — but no React code ever subscribes (zero consumers of `onMenuPush` in `app/src`). Clicking the menu item is a silent no-op.

## Fix
- Subscribe once in the app shell (e.g. in `ProjectWorkspace` or a small effect hook owned by the workspace): `onMenuPush(() => dataService.push())`, with cleanup on unmount and error surfacing to the existing workspace error alert.
- Guard: only meaningful when a project is open; otherwise ignore or show a hint.
- Consider disabling the menu item while no project is open (main can be informed via IPC later; minimum fix is the renderer guard).

## acceptance criteria
- With a local project open and pending commits, `Project → Push` pushes (verified through a mocked bridge asserting `push` is called).
- Push failures appear in the workspace error alert.
- The listener is removed on unmount (no duplicate pushes after remount).

## see also
- `design\feature_descriptions\F_013_desktop_app.md`
