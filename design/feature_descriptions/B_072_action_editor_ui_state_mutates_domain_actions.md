---
id: B-072
title: action editor UI state mutates domain actions
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

The selected action-editor tab is stored in `ActionDefinition.editorState`. `ActionService.setSelectedEditorTab` directly mutates the shared `ActionDefinition` object and does not dispatch a service event.

This mixes transient view state into domain objects used by action execution, search, tree rendering, and persistence publication. Consumers cannot observe the mutation through the service event contract, and every action reload/save needs special logic to copy editor state into newly validated domain objects.

## Fix

- Move selected-tab state to a UI-owned store keyed by stable action path or tab identity.
- Keep `ActionDefinition` limited to executable domain data and source metadata required by the action service.
- Update editor-tab state through an observable React/UI state path; do not mutate shared service objects.
- Remove `preserveActionEditorStates` and editor-state copying from action graph load/save paths once all call sites use the UI store.

## Edge cases

- Switching between several open actions.
- Saving or externally reloading an action while a phrase tab is selected.
- Closing and reopening an action tab.
- Switching between card and text view.
- Project switch with identical action paths.
- Selected phrase removed by an external change.

## acceptance criteria

- `ActionDefinition` and action-service publication contain no transient editor-tab state.
- Selecting an editor tab does not mutate a shared domain object.
- Tab selection survives the currently supported view/tab transitions and resets across project identity where required.
- Action loading, validation, saving, search, and execution do not copy or inspect editor UI state.
- Tests cover multiple actions, reload/save publication, view switching, close/reopen, and project switching.

## see also

- [[B-052]]
- `design\architecture\architectural_decisions.md`
- `design\architecture\initial description\writings\action_editor.md`

