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

> **Split for implementation.** This feature is too large to build in one pass and has been divided into ordered sub-features. Implement these instead; this file is kept as the umbrella spec.
> - [[F-010a]] action model and loading — model, loader, validation, circular-call check, service + hook
> - [[F-010b]] action entry points and popup — `appliesTo` filtering, entry-point UI, resizable popup, `before`/`after` shortcuts
> - [[F-010c]] command execution and chaining — preload bridge, placeholders, `before`/main/`on`/`after` ordering, logs/status
> - [[F-010d]] agent actions — agent flow, extra-prompt input, run history, `convert to action`
> - [[F-010e]] state triggers and folder watching — `onState` triggers, actions-folder hot-reload
>
> Dependency order is strict a → b → c → d/e (d and e both build on c; either order once c lands).

## Goal
Load action definitions (json) from the project's actions folder, show context-sensitive action entry points, and run actions from a dedicated action popup via the Electron app: agent or cmd type, custom prompt action, placeholders, before/after sub-actions, condition->action pairs on output, circular-call checking, state-change triggers (`onState`), and context-sensitive UI display via `appliesTo`.

## Current state
Not implemented. The current app can load markdown files through GitHub or the Electron local-Git bridge, but there is no action definition model, actions bridge, runner, action popup, logs, `appliesTo` filtering or `onState` trigger handling.

## implementation details
- Add an action model for json definitions with `name`, `label`, `description`, `type`, `text`, optional `icon`, `appliesTo`, `before`, `after`, `on` and `onState`.
- Add a built-in `custom prompt` agent action that is always available for matching action contexts, independent of project action files.
- Load actions from the configured project actions folder when a project opens; fail fast on invalid json, missing required fields, unknown action refs or circular calls.
- Keep action state in a singleton app service and expose it to React through a hook. React displays compact action entry points close to the matching card/file/folder based on `appliesTo`.
- Open a popup when the user activates an action entry point. The popup is the execution surface for the selected action and context.
- Make the action popup resizable, with resize handles placed on the lower-left or lower-right corner based on popup position.
- Show a `Run` command in the popup to start the selected action.
- For `agent` actions, show an input dialog for extra prompt text before running. If the action was previously triggered for the selected context, show its run history in the popup.
- Always show shortcuts from the popup to the action's `before` and `after` actions. Activating a shortcut opens a new action popup for that related action and the same context.
- When the user enters custom input, offer `convert to action` so the custom prompt can become a stored action definition.
- Add preload bridge methods for running actions. Command actions execute from preload unless a command requires main-owned Electron APIs; agent actions start the configured agent command/prompt flow.
- Resolve placeholders at run time from the selected context, at minimum `rootProjectFolder` and `file`.
- Execute `before`, main action, `on` output matches and `after` in a deterministic order. `after` runs even when the main action fails; errors are returned in the action log/status.
- Trigger actions with `onState` when a card state changes to the configured value.
- Watch the actions folder in local-Electron mode and notify React when definitions change.

## acceptance criteria
- Opening a project loads valid action json files from the configured actions folder and exposes them to the React UI.
- Invalid action definitions show a clear load error and do not silently fall back to partial behavior.
- Actions are shown only for contexts matching `appliesTo`.
- The built-in `custom prompt` action is always available for contexts where actions can run.
- Activating an action opens a resizable popup for that action and context.
- The action popup can run the selected action and reports running, completed and failed states clearly.
- Agent action popups support extra prompt input and show previous run history for the same action/context when available.
- Action popups expose shortcuts to `before` and `after` actions, and each shortcut opens a new popup for that related action.
- Entering custom prompt input exposes a `convert to action` path for storing it as a reusable action.
- Running a command action executes through Electron with placeholders resolved for the selected file/project.
- `before`, `after` and `on` action chains run in order, reject circular references and report failures clearly.
- Changing a card to a state configured by `onState` triggers the matching action.
- Adding, editing or removing local action definitions updates the available UI actions without restarting the app.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\action_popup.md`
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\data management.md`
