---
id: B-015
title: electron renderer runs without context isolation
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`desktop/main.js` creates the window with `contextIsolation: false, sandbox: false`, and `preload.js` assigns bridge objects (and its closure over Node modules like `child_process`, `fs`, git) directly onto `window`. The window loads a **configurable, remotely deployed URL** (J-001 design). Any compromise of that site — or of any dependency it ships — gains transitive access to shell execution and the filesystem. This is a real security defect, not a style preference.

## Fix
- Enable `contextIsolation: true` (and `sandbox: true` where compatible) and expose the bridges via `contextBridge.exposeInMainWorld('md2Data', …)` etc. Only serializable data and explicit functions cross the boundary.
- Preload keeps owning local capabilities per the architecture, but every exposed method validates its inputs (paths inside project root already partially enforced via `ensureInsideRoot` — keep and extend).
- Callback-style APIs (`onMenuPush`, future agent streaming) must be wrapped so raw `ipcRenderer` is never exposed.
- Verify the React bridge detection (`getElectronDataBridge` and friends) still works against the contextBridge-exposed globals; adjust typings.

## acceptance criteria
- The renderer runs with `contextIsolation: true`; `require`/Node globals are unreachable from the page.
- All existing bridge features (data, auth proxy, theme, config, actions) work unchanged through `contextBridge`.
- Bridge methods reject paths escaping the project root and non-string commands.
- Desktop tests cover the exposed-surface shape; a smoke test confirms no `window.require` leakage.

## see also
- `design\feature_descriptions\F_013_desktop_app.md`
- `design\architecture\initial description\desktop app.md`
