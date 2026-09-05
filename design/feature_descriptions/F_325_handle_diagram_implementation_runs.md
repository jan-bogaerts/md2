---
author:
id: F_325
internalId: 2c3dd0ae-5b3d-44e6-8186-a7c28544995a
title: handle diagram implementation runs
status: ready
owner:
affects:
agents:
  - design/activity/card__2c3dd0ae-5b3d-44e6-8186-a7c28544995a.json
policy:
after: 7f17626c-05f4-40b0-9d26-824728c4cd43
changedFiles:
  - app/src/components/diagram_view/diagram_change_review_dialog.test.tsx
  - app/src/components/diagram_view/diagram_change_review_service.test.ts
  - app/src/components/diagram_view/diagram_change_review_service.ts
  - app/src/data/action_context.node.test.ts
  - app/src/data/action_context.ts
  - app/src/services/actions/action_prompt_draft_service.node.test.ts
  - app/src/services/actions/action_prompt_draft_service.ts
  - app/src/services/actions/action_run_registry.node.test.ts
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Track implementation runs started from a diagram change review without losing pending work.

## Acceptance criteria

* Failed, cancelled, or interrupted runs retain the editable diagram and reviewed change set for retry.
* A successful run marks that reviewed change set as delivered but does not discard edits or overwrite either diagram.
* Later edits create a new undelivered review state.
* Results are matched by canonical action, run, and diagram context identities, never output paths.
* Existing diagram-producing run handling remains unchanged.

## State and rendering rule

Run status and delivered state are separate service-owned primitives keyed by run and reviewed change-set identity. A run event updates only consumers of those primitives; it does not republish the editable diagram, change collection, or comparison UI.

## Dependencies

[F\_324](F_324_pass_diagram_changes_to_an_agent.md).
