---
author:
id: F_323
internalId: 2f0581e4-58bf-4995-a225-12ec0c03e9c0
title: add diagram change review
status: new
owner:
affects:
agents:
policy:
after: f4697a13-3aa5-4a9e-ba9f-83276e18557b
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Let the user review the generated change list before sending it to an agent.

## Scope

Show a review dialog containing grouped semantic changes, generated text, validation state, and actions in the bottom-right corner.

## Acceptance criteria

* The review always reflects the current editable diagram.
* Empty change sets show a clear no-changes state and disable agent handoff.
* Invalid editable data identifies blocking items and disables handoff and save.
* Closing review does not clear or modify edits.
* Selecting a listed change identifies its affected diagram objects without moving them.

## Dependencies

[F_279](F_279_validate_diagram_edit_operations.md) and [F_322](F_322_generate_diagram_change_descriptions.md).
