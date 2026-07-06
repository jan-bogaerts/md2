---
id: B-007
title: startup restore errors are swallowed
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`useAppBootstrap` (`app/src/app/use_app_bootstrap.ts`) captures restore failures into `state.error`, but `App` (`app/src/app.tsx`) never reads it — a failed last-project restore (bad token, deleted repo, moved folder) silently renders an empty workspace with no explanation.

## Fix
- Pass `bootstrap.error` into `MainWindow`/workspace and render it as a dismissible alert ("Could not restore last project: …") above the workspace.
- Distinguish "nothing to restore" (no message) from "restore failed" (message).
- Consider clearing the stored last-project reference after repeated deterministic failures so the app doesn't retry a dead project forever (optional).

## acceptance criteria
- A failing project restore shows a visible error message after startup; the app remains usable to open another project.
- No error is shown when there is simply no previous project.
- Test covers the error propagation from a rejected `openProject` to the rendered alert.

## see also
- `design\feature_descriptions\F_004_app_layout.md`
