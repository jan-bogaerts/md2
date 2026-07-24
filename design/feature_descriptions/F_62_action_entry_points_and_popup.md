---
id: F_62
title: action entry points and popup
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: d63ac574-4812-4643-8688-14399dad4099
---

## Goal

Show context-sensitive action entry points based on `appliesTo` and open a resizable popup bound to an action `id` and context. The popup starts and cancels runs through the Electron runner from [[F-010c]] and links to related actions by id.

## Current state

The existing popup receives resolved action objects and calls the React-side `ActionRunner`. Related actions are embedded resolved objects, and the popup has no Electron execution-id cancellation contract.

## implementation details

- Evaluate `appliesTo` for card, file, folder, and other supported contexts and display compact action entry points close to the matching item.
- Always offer the built-in custom-prompt action in supported contexts.
- Open the popup for the selected action `id` and context. Resolve current display data from the action service.
- Make the popup resizable, with the resize handle placed according to popup position.
- `Run` sends `{ actionId, context, runInput }` to the Electron runner.
- While running, show `Cancel`; it sends the Electron execution id to the cancellation method and waits for the terminal event.
- Show links for `onBefore` and `onAfter`; selecting one resolves that related action id and opens a popup with the same context.
- Show phase-specific status/log output returned by Electron, including `okButNotAfter`.
- Show `Schedule` as an entry point to [[F-022]] without duplicating schedule behavior here.
- For a card with in-memory `currentAction`, disable every action entry point for that card until a terminal execution event clears it.

## acceptance criteria

- Entry points appear only for matching contexts, and a card with a current action disables all of them.
- The custom-prompt action remains available in every supported context.
- Activating an entry point opens a resizable popup bound to the action id and context.
- `Run` sends no command, prompt template, or linked definitions from React.
- `Cancel` stops a running Electron execution and the popup shows its cancelled result.
- Related-action links continue to work after an action name changes.
- Tests cover filtering, card disabling, popup open/resize, ID-based related navigation, run requests, cancellation, and terminal-state updates.

## see also

- `design\architecture\initial description\action_popup.md`
- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\ready\F_010a_action_model_and_loading.md`
- `design\feature_descriptions\ready\F_022_scheduled_actions.md`
