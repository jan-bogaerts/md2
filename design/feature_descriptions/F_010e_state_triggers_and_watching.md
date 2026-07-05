---
id: F-010e
title: state triggers and folder watching
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Trigger actions when a card changes to the state configured by `onState`, and watch the actions folder in local-Electron mode so adding, editing or removing definitions updates the available actions without restarting the app. Reactive slice of `design\feature_descriptions\F_010_actions.md`, building on [[F-010a]] and [[F-010c]].

## Current state
[[F-010a]] loads actions once on project open and [[F-010c]]/[[F-010d]] run them from the UI, but definitions are static after load and nothing responds to card state changes. There is no `onState` trigger handling and no watcher on the actions folder to hot-reload definitions.

## implementation details
- Handle the `onState` field: when a card's state changes to the configured value (e.g. dragged to a status column in [[F-005]]), trigger the matching action for that card's context through the runner from [[F-010c]].
- Watch the configured actions folder in local-Electron mode; on add/edit/remove of definition files, re-validate through [[F-010a]] and publish the updated action list to React.
- Debounce reloads and surface validation errors from changed files without dropping the previously valid action set silently.

## acceptance criteria
- Changing a card to a state configured by `onState` triggers the matching action with the card's context.
- Adding, editing or removing local action definitions updates the available UI actions without restarting the app.
- Reloads re-run [[F-010a]] validation and report errors on changed files clearly.
- Tests cover `onState` trigger dispatch and add/change/remove-driven action-list updates.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\data management.md`
- `design\architecture\initial description\overview.md`
