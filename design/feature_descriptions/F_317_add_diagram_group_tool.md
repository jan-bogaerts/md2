---
author:
id: F_317
internalId: 587b42de-3d65-4665-9cb8-b714397a6964
title: add diagram group tool
status: ready
owner:
affects:
agents:
  - design/activity/card__587b42de-3d65-4665-9cb8-b714397a6964.json
policy:
changedFiles:
  - app/src/components/diagram_view/diagram_group_button.test.tsx
  - app/src/components/diagram_view/diagram_group_button.tsx
  - app/src/components/diagram_view/diagram_group_drawing_preview.tsx
  - app/src/components/diagram_view/diagram_group_label_dialog.test.tsx
  - app/src/components/diagram_view/diagram_group_label_dialog.tsx
  - app/src/components/diagram_view/diagram_group_label_form.tsx
  - app/src/components/diagram_view/diagram_toolbox.test.tsx
  - app/src/components/diagram_view/diagram_toolbox.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/editable_diagram_leaves.test.tsx
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_group_drawing_service.test.ts
  - app/src/services/diagrams/diagram_group_drawing_service.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
  - app/src/services/diagrams/diagram_move_service.test.ts
  - app/src/services/diagrams/diagram_move_service.ts
  - app/src/services/diagrams/diagram_resize_service.test.ts
  - app/src/services/diagrams/diagram_resize_service.ts
  - shared/diagram_data.mjs
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a Group drawing tool and make groups independently positioned and sized.

## Scope

Extend DiagramGroup with grid-aligned x, y, width, and height. Draw a rectangular group on New, then enter its label. Permit an initially empty member list; membership is handled separately.

## Acceptance criteria

* Group geometry is persisted and no longer derived from member bounds.
* Pointer preview and completion work through scroll and zoom.
* A completed group has a valid ID, non-empty label, explicit geometry, and selectable rendering.
* Moving member nodes does not move or resize the group.
* A group without explicit geometry uses automatic layout; the first user move or resize writes explicit geometry.

## State and rendering rule

Creation changes group membership once and mounts one group leaf by ID. Group x, y, width, height, and label are assigned on that stable group object and observed only by its leaf. Member nodes and diagram parents do not rerender when independent group geometry changes.

## Dependencies

[F\_278](F_278_make_diagram_layout_compatible_with_editing.md), [F\_289](F_289_add_diagram_coordinate_conversion.md), and [F\_286](F_286_manage_active_diagram_tool.md).
