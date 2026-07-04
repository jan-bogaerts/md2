---
id: F-011
title: batch commands
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Support batch/PowerShell/bash scripts (with parameters and placeholders) in configurable folders as runnable actions; the Electron app monitors these folders and adds/updates/removes the related actions, notifying the React app of changes. Extension to `design\feature_descriptions\F_010_actions.md`

## Current state
Not implemented. F-010 action loading/running is also not implemented yet. The Electron app currently exposes only local Git/data IPC, watches markdown changes under the project root and has no script-folder config, script discovery, command runner, parameter model or action-change notification channel.

## implementation details
- Extend the F-010 action model with generated `cmd` actions sourced from configured script folders.
- Support project-level script folders and Electron-app-level script folders; require Electron/local mode for execution.
- Discover `.bat`, `.cmd`, `.ps1` and `.sh` files. Use an optional sidecar json file for label, description, icon, `appliesTo`, parameters and default values; otherwise derive a minimal action from the script filename.
- Resolve parameter values and placeholders at run time from the selected action context, matching F-010 placeholder behavior.
- Execute scripts in Electron with explicit interpreters: Windows command processor for `.bat`/`.cmd`, Windows PowerShell 5.x for `.ps1` and a configured bash executable for `.sh`.
- Watch configured folders, debounce reloads and publish action-list updates to React when scripts or sidecar json files are added, changed or removed.
- Fail fast with clear load/run errors for invalid sidecar json, duplicate generated action names, unsupported extensions, missing configured folders, missing bash executable or attempts to run outside the configured folders.
- Treat generated script actions like normal F-010 actions for `before`, `after`, `on`, `onState`, circular-call checks, logs and UI filtering.

## acceptance criteria
- Opening a local Electron project loads script actions from configured project and Electron script folders.
- Script actions appear in the same React action surfaces as F-010 actions and respect `appliesTo`.
- Running `.bat`, `.cmd`, `.ps1` and configured `.sh` scripts executes through Electron with placeholders and configured parameters resolved.
- Invalid script metadata, duplicate generated names and missing interpreters produce clear user-visible errors.
- Adding, editing or removing scripts or sidecar json files updates available actions without restarting the app.
- Script actions participate in F-010 chaining, output matching, state triggers and circular-call validation.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\data management.md`
