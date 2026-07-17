---
id: B-072
title: action editor state changes are not observable
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

`ActionDefinition.editorState` intentionally owns the action's non-serialized editor state, including the selected tab and stable phrase editor identities. `ActionService.setActionEditorState` currently mutates that field without dispatching a service event.

Consumers therefore cannot observe the change through the service event contract. `ActionEditor` compensates with local React state, while save and reload flows replace validated action objects and need to preserve the editor state attached to the previous action object.

## Fix

- Keep `editorState` on each `ActionDefinition`; do not introduce a separate dictionary or UI store keyed by action path.
- Route editor-state changes through `ActionService` in the name of the owning action and dispatch the service's change event after the action is updated.
- Make the service-published action state the source of truth for `ActionEditor` instead of maintaining an independent copy of the same state in React.
- When validation, save, or reload replaces an action object, carry its non-serialized `editorState` into the replacement action as part of action reconciliation. Do not model this as an independently owned path-to-state registry.
- Keep `editorState` out of persisted action JSON and Electron execution payloads.
- If editor state later requires a genuinely independent lifecycle or event contract, model it as an explicit child object owned by the action and expose changes through `ActionService`; do not add a parallel lookup dictionary for semantic separation alone.

## Edge cases

- Switching between several open actions.
- Saving or externally reloading an action while a phrase tab is selected.
- Closing and reopening an action tab.
- Switching between card and text view.
- Selected phrase removed by an external change.
- Action deletion and project clearing must discard the editor state with the owning action.

## acceptance criteria

- Each loaded `ActionDefinition` owns its `editorState`; no separate action-path-to-editor-state store is introduced.
- Selecting an editor tab updates the owning action through `ActionService` and notifies service observers.
- `ActionEditor` does not keep an independent authoritative copy of action editor state.
- Tab selection survives the currently supported view/tab transitions and resets across project identity where required.
- Save and reload preserve editor state on replacement action objects without serializing it.
- Persisted action JSON and Electron execution payloads contain no `editorState`.
- Tests cover multiple actions, reload/save publication, view switching, close/reopen, and project switching.

## see also

- [[B-052]]
- `design\architecture\architectural_decisions.md`
- `design\architecture\initial description\writings\action_editor.md`
