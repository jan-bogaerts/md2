---
id: F-010e
title: state triggers and folder watching
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 9a11a9d0-d48e-425a-abda-4f7d5f29933e
---

## Goal

Trigger ID-based actions through Electron when a card receives the configured `onState`, keep a card's current action in memory while it runs, and hot-reload action definitions without restarting.

## Current state

State changes call the React `ActionRunner` with a resolved action object. Definition watching reloads the legacy name-based model. Cards have no single current-action field that disables every entry point during execution.

## implementation details

- When a card changes to an `onState` value, request the matching action `id` through the Electron action runner with the card context.
- Use the same execution and error events as popup and scheduled runs; do not start a renderer-side chain.
- Before the run, set the card's in-memory `currentAction` to the root action id and publish the state change to the UI.
- While `currentAction` is set, disable every action entry point for that card.
- On completed, failed, cancelled, or `okButNotAfter`, clear `currentAction` and publish another update.
- Do not persist `currentAction`; project/app startup begins with no current actions.
- Watch the configured actions folder in Electron. On add/edit/remove, revalidate the complete canonical ID-based set and publish it to React.
- Debounce reloads, retain the previous valid set after validation failure, and report the actual invalid source file.

## acceptance criteria

- A matching state change starts the action by id through Electron.
- State-triggered runs appear in the same execution UI and global running indicator as manual runs.
- A card with a current action disables all its actions; every terminal execution result clears it.
- Restarting the app does not restore a stale current action.
- Definition add/change/remove updates the UI without restarting and never falls back to the legacy shape.
- Tests cover state dispatch, current-action set/clear for every terminal state, disabled entry points, and multi-file reload/error attribution.

## see also

- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\ready\F_010a_action_model_and_loading.md`
- `design\feature_descriptions\ready\B_009_running_agents_visibility.md`
