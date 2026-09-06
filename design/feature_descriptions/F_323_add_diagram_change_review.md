---
author:
id: F_323
internalId: 2f0581e4-58bf-4995-a225-12ec0c03e9c0
title: add diagram change review
status: ready
owner:
affects:
agents:
  - design/activity/card__2f0581e4-58bf-4995-a225-12ec0c03e9c0.json
policy:
after: f4697a13-3aa5-4a9e-ba9f-83276e18557b
changedFiles:
  - app/src/components/diagram_view/diagram_change_review_actions.tsx
  - app/src/components/diagram_view/diagram_change_review_button.tsx
  - app/src/components/diagram_view/diagram_change_review_dialog.test.tsx
  - app/src/components/diagram_view/diagram_change_review_dialog.tsx
  - app/src/components/diagram_view/diagram_change_review_list.tsx
  - app/src/components/diagram_view/diagram_change_review_report.tsx
  - app/src/components/diagram_view/diagram_change_review_row.tsx
  - app/src/components/diagram_view/diagram_change_review_service.test.ts
  - app/src/components/diagram_view/diagram_change_review_service.ts
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

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

## State and rendering rule

The review list host subscribes only to ordered change IDs. Each row subscribes to its own change fields. Updating one existing change rerenders one row; it does not rebuild the list, diagram, comparison root, or generated report. Full text is generated only when the user requests review or handoff.

## Dependencies

[F\_279](F_279_validate_diagram_edit_operations.md) and [F\_322](F_322_generate_diagram_change_descriptions.md).
