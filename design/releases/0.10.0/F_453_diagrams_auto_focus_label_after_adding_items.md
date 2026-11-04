---
author: 
id: F_453
internalId: ed0eaa91-383d-492b-ad2d-06963c9777a6
title: diagrams auto focus label after adding items
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__ed0eaa91-383d-492b-ad2d-06963c9777a6.json
policy:
after: b09a5f55-9e4f-4329-b6a7-00cec60df2e9
changedFiles:
  - app/src/components/diagram_view/details/diagram_edge_details_editor.tsx
  - app/src/components/diagram_view/details/diagram_object_details_dialog.test.tsx
  - app/src/components/diagram_view/details/diagram_object_details_dialog.tsx
  - app/src/components/diagram_view/editing/diagram_edge_label_focus_handler.tsx
  - app/src/components/diagram_view/editing/diagram_inline_edge_controls.tsx
  - app/src/components/diagram_view/editing/diagram_inline_node_controls.tsx
  - app/src/components/diagram_view/editing/editable_diagram.test.tsx
  - app/src/components/diagram_view/editing/editable_diagram.tsx
  - app/src/components/diagram_view/editing/editable_diagram_collections.tsx
  - app/src/components/diagram_view/editing/editable_diagram_edge.tsx
  - app/src/components/diagram_view/editing/editable_diagram_node.tsx
  - app/src/components/diagram_view/rendering/diagram_edge.tsx
  - app/src/components/diagram_view/rendering/diagram_node.tsx
  - app/src/components/diagram_view/surface/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/surface/diagram_zoom_viewport.tsx
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.ts
  - app/src/services/diagrams/diagram_label_focus_service.test.ts
  - app/src/services/diagrams/diagram_label_focus_service.ts
  - app/src/services/diagrams/diagram_node_placement_service.test.ts
  - app/src/services/diagrams/diagram_node_placement_service.ts
---

With the add tool, the user can add new items to a diagram. Most items have a label. Keyboard focus should be on this label after adding, so user can start typing label without extra clicking

## Current state

* `DiagramAddControl` activates node placement, edge drawing, group drawing, or fragment creation. `DiagramZoomViewport` passes the pointer event's `ctrlKey` to node, edge, and group completion.
* `DiagramNodePlacementService.place` and `DiagramEdgeDrawingService.completeTarget` create and select the new object. Without Ctrl they switch to Select; with Ctrl they keep the Add tool active. Neither path requests keyboard focus.
* Editable nodes render their label through `DiagramInlineNodeControls`. Its `TextField` can edit the label, but has no focus request or input ref, so adding a node leaves focus outside the label.
* Edges have no inline label input. Their label is edited in `DiagramEdgeDetailsEditor`, whose Label field receives focus only after the details dialog is opened manually.
* Group drawing already opens `DiagramGroupLabelDialog` before creation. Its required Label field has `autoFocus`; saving that form creates the group. Sequence fragments have operators and region guards, but no label field.
* Selection and active Add tool are independent view state. Keeping a node or edge Add tool active does not prevent focus from moving to the new object's label.

## implementation details

* Add `DiagramLabelFocusService` in `app/src/services/diagrams/diagram_label_focus_service.ts`. It owns one pending `{ objectId, objectKind }` target for `node` or `edge`, publishes changes through `EventTarget`, and exposes snapshot, subscription, request, and completion operations. A request remains pending until the matching input focuses, so creation and React mounting order cannot lose it. Clear pending state when the edit session changes.
* Inject the focus service into `DiagramNodePlacementService` and `DiagramEdgeDrawingService`. After successful creation, selection, gesture completion, and any tool transition, request label focus for the returned ID. Request focus for both ordinary clicks and Ctrl-clicks. Ctrl affects only whether the Add tool remains active.
* In `DiagramInlineNodeControls`, subscribe only to the focus state for its node. When requested, focus the underlying input, select its complete default label, then complete the request. Existing pointer-event isolation remains: typing edits the label while the active node Add tool still determines later surface-click behavior.
* Add a small edge-focus handler under `components/diagram_view/editing`. When an edge focus request arrives, open `DiagramObjectDetailsService` for that edge. `DiagramEdgeDetailsEditor` then focuses and selects the complete Label value before completing the request. Manual details opening keeps its current focus behavior and must not be treated as a creation request.
* Do not change Add-tool state when focusing. After Ctrl-click, user releases Ctrl and types; behavior while Ctrl remains physically held needs no special handling. After editing, the next diagram-surface click still uses the active Add tool.
* Group creation remains unchanged because its label is already focused and entered before creation. Fragment creation remains unchanged because fragments have no label.
* Cover focus-service request lifetime and session clearing; node and edge requests for Ctrl and non-Ctrl creation; node input focus and full-text selection; edge dialog opening, focus, and full-text selection; and preserved active-tool state after Ctrl creation. Run affected diagram service/component tests and `npm run lint` in `app/`.

## acceptance criteria

1. After adding a node without Ctrl, its inline Label input has keyboard focus and its complete default label is selected, so typing replaces that label.
2. After adding an edge without Ctrl, its details dialog opens, its Label input has keyboard focus, and its complete default or existing label is selected.
3. After adding a node or edge with Ctrl, the same label focus and selection occur while the chosen Add tool remains active.
4. After a Ctrl-add, releasing Ctrl and typing changes only the new object's label. The next diagram-surface click still starts or completes another addition with the active tool.
5. Focus is requested only after creation succeeds. Failed or cancelled creation neither opens edge details nor moves focus to a label.
6. Group creation keeps focusing its required pre-creation Label field. Fragment creation remains unchanged because a fragment has no label.
7. Manually opening node or edge details retains its current focus behavior; full-label selection caused by this feature occurs only for a newly added object.
