---
id: F-010
title: actions
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Load action definitions (json) from the project's actions folder and run them via the Electron app: agent or cmd type, placeholders, before/after sub-actions, condition→action pairs on output, circular-call checking, state-change triggers (`onState`), and context-sensitive UI display via `appliesTo`.

## Current state
Not implemented. The current app can load markdown files through GitHub or the Electron local-Git bridge, but there is no action definition model, actions bridge, runner, action UI, logs, `appliesTo` filtering or `onState` trigger handling.

## implementation details
- Add an action model for json definitions with `name`, `label`, `description`, `type`, `text`, optional `icon`, `appliesTo`, `before`, `after`, `on` and `onState`.
- Load actions from the configured project actions folder when a project opens; fail fast on invalid json, missing required fields, unknown action refs or circular calls.
- Keep action state in a singleton app service and expose it to React through a hook. React displays actions close to the matching card/file/folder based on `appliesTo`.
- Add preload bridge methods for running actions. Command actions execute from preload unless a command requires main-owned Electron APIs; agent actions start the configured agent command/prompt flow.
- Resolve placeholders at run time from the selected context, at minimum `rootProjectFolder` and `file`.
- Execute `before`, main action, `on` output matches and `after` in a deterministic order. `after` runs even when the main action fails; errors are returned in the action log/status.
- Trigger actions with `onState` when a card state changes to the configured value.
- Watch the actions folder in local-Electron mode and notify React when definitions change.

## acceptance criteria
- Opening a project loads valid action json files from the configured actions folder and exposes them to the React UI.
- Invalid action definitions show a clear load error and do not silently fall back to partial behavior.
- Actions are shown only for contexts matching `appliesTo`.
- Running a command action executes through Electron with placeholders resolved for the selected file/project.
- `before`, `after` and `on` action chains run in order, reject circular references and report failures clearly.
- Changing a card to a state configured by `onState` triggers the matching action.
- Adding, editing or removing local action definitions updates the available UI actions without restarting the app.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\data management.md`
