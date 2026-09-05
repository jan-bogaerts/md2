---
author:
id: F_278
internalId: 14f288d9-b541-4263-a2b5-74f1d1b95c68
title: make diagram layout compatible with editing
status: ready
owner:
affects:
agents:
  - design/activity/card__14f288d9-b541-4263-a2b5-74f1d1b95c68.json
policy:
changedFiles:
  - app/src/components/diagram_view/use_diagram_geometry.test.tsx
  - app/src/components/diagram_view/use_diagram_geometry.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_geometry_service.test.ts
  - app/src/services/diagrams/diagram_geometry_service.ts
after: 5347a970-419c-495a-9b4e-c9aafcce6741
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Keep derived geometry valid through incremental, dependency-scoped updates without running whole-diagram layout for an edit.

## Scope

* Keep `layout(data)` for initial load only. It may construct the first positioned view from complete model data.
* Add service-owned, stable positioned view objects addressed by object ID. React reads their primitive fields through leaf subscriptions.
* Assign derived fields on the existing positioned owner and dispatch only its field-scoped events.
* A node position or size change updates that node, its incident edge routes and labels, and surface bounds when necessary. It never reroutes unrelated edges or repositions unrelated nodes.
* An edge endpoint, connection point, kind, label, or waypoint change updates only that edge's route and label data, plus endpoint fan-in when direction changes.
* Fixed-box content changes such as label, sublabel, tag, role, and entity fields do not invoke layout.
* Adding an object computes geometry for that object without moving existing objects. Removing one deletes only its view entry and directly dependent view entries.
* Sequence edits update the changed message and only later rows, activations, or fragments whose coordinates depend on its row.
* Group geometry is independent. Member movement never recalculates the group box.
* Maintain surface bounds incrementally instead of traversing the complete diagram after every pointer move.

## Acceptance criteria

* Explicit user geometry survives unrelated changes.
* Moving a node updates attached edge rendering without moving unrelated nodes.
* All five diagram types remain renderable after supported mutations.
* A non-geometric field update calls no layout or routing function.
* An instrumented node move proves that only the node, incident edges, and any changed surface bound dispatch events.
* Diagram root, collection hosts, unrelated objects, and comparison layout do not rerender for a derived field update.
* Full `layout()` is absent from the ordinary mutation call graph.

## Dependencies

[F_329](F_329_make_diagram_edit_updates_granular.md) and [F_276](F_276_add_diagram_mutation_operations.md).
