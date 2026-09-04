---
author:
id: F_290
internalId: 6e041d8b-7aca-4ab1-9be5-56d7e31d189c
title: add diagram selection service
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__6e041d8b-7aca-4ab1-9be5-56d7e31d189c.json
policy:
branch: f_290_add_diagram_selection_service
worktree: 1
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a selection service for nodes, edges, and groups in the active edit session.

## Scope

Store selections as object kind plus stable object ID. Use `EventTarget`, granular events, and stable snapshots. Remove missing identities after diagram mutations and clear on session reset.

## Acceptance criteria

* Selection never uses array index, label, DOM element, or file path as identity.
* The service supports replace, add, remove, toggle, clear, and membership queries.
* Deleting an object removes it from selection before publication.
* Multiple subscribers receive scoped updates without revision counters.

## State and rendering rule

Selection is stored by stable identity and updated without replacing a selected diagram object. Each selectable leaf subscribes to its own selected boolean. A selection-membership snapshot changes only when membership changes; diagram roots, object collections, unrelated leaves, and model data do not rerender or change.

## Dependencies

[F\_275](F_275_add_diagram_edit_session_service.md).