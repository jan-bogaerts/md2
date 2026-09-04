---
author:
id: F_291
internalId: 2f8b255c-a6f9-4f92-ad54-3f4358b2e512
title: add direct diagram selection
status: ready
owner:
affects:
agents:
  - design/activity/card__2f8b255c-a6f9-4f92-ad54-3f4358b2e512.json
policy:
branch: f_291_add_direct_diagram_selection
worktree: 1
changedFiles:
  - app/src/components/diagram_view/diagram.tsx
  - app/src/components/diagram_view/diagram_comparison.tsx
  - app/src/components/diagram_view/diagram_edge.tsx
  - app/src/components/diagram_view/diagram_group.tsx
  - app/src/components/diagram_view/diagram_node.test.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/editable_diagram.test.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/editable_diagram_collections.tsx
  - app/src/components/diagram_view/editable_diagram_edge.tsx
  - app/src/components/diagram_view/editable_diagram_group.tsx
  - app/src/components/diagram_view/editable_diagram_leaves.test.tsx
  - app/src/components/diagram_view/editable_diagram_node.tsx
  - app/src/components/diagram_view/editable_diagram_selection.test.tsx
  - app/src/components/diagram_view/tabbed_diagram_comparison.tsx
  - app/src/components/diagram_view/use_diagram_selection.ts
  - app/src/components/diagram_view/vertical_diagram_comparison.tsx
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Implement direct selection in the Select tool.

## Current state

* `DiagramEditSessionService` owns the active persistent tool, which defaults to `select`, and exposes a synchronous snapshot for event handlers.
* `DiagramSelectionService` already owns node, edge, and group selection as stable `{ objectKind, objectId }` identities. It supports replacement and clearing plus identity-scoped subscriptions.
* Current renders through `DiagramRenderer`. Node and edge activation opens the existing child-action or saved-diagram menu; groups are non-interactive and nodes with `drilldown: false` cannot activate that menu.
* New renders through `DiagramZoomViewport` and service-bound editable leaves. Its comparison layouts do not connect node or edge activation to selection, groups have `pointerEvents: 'none'`, and no leaf renders its selected state. Clicking New background therefore does not clear selection.

## Implementation details

* Keep direct selection inside New. Pass `DiagramSelectionService` as an injectable service dependency through `DiagramZoomViewport`, `EditableDiagram`, collection hosts, and selectable leaves; do not route New activation through `DiagramViewService` or its menu payload.
* Add a selection hook backed by `useSyncExternalStore`. Each selectable leaf subscribes with `subscribeSelected` and reads `getSelectedSnapshot` for its own stable identity only.
* On pointer activation, read `getActiveToolSnapshot()`. When the active tool is exactly `select`, call `replace` with the activated node, edge, or group identity. Do not add Ctrl-click toggle behavior; F_292 owns additive selection.
* Make New groups pointer- and keyboard-operable. Make every New node selectable, including `drilldown: false` nodes; that field controls Current drill-down only. Enter and Space perform the same replacement as a pointer click and prevent their browser default.
* Handle bubbling clicks at the New drawing surface. If the event has no selectable node, edge, or group ancestor and Select is active, call `clear`. This includes blank areas covered by the connections SVG, while an object click must not be cleared after its leaf handler runs.
* Give shared node, edge, and group primitives explicit caller-owned interaction and selected presentation inputs. Verified call sites diverge intentionally: `Diagram` keeps Current node and edge drill-down behavior plus non-interactive groups; editable leaves use selection behavior for all three object kinds. No other call sites require another mode.
* Mark selected objects with accessible selected state and theme-backed treatment: `primary.main` for outline or edge stroke and `custom.primaryBg` for any halo or tint. Keep keyboard focus visible. Do not add raw colors or replace role-based node styling.
* Keep selection outside diagram model, geometry, and change tracking. Selection changes must not publish edit-session field or collection events.
* Add user-interaction tests for pointer activation, Enter and Space, empty-surface clearing, inactive-tool guards, `drilldown: false` nodes, all three object kinds, Current regressions, and leaf render isolation.

## Acceptance criteria

* While Select is active, plain-clicking a New node, edge, or group replaces the complete selection with that object's stable kind and ID. A New node remains selectable when `drilldown` is `false`.
* While Select is active, clicking New drawing-surface space with no selectable object under the pointer clears selection. Object activation is not cleared by the same bubbling event.
* Pointer or keyboard activation while another persistent tool is active does not change selection or open a drill-down menu.
* Enter and Space select the focused New node, edge, or group without opening the Current child-action menu.
* Every selected New object exposes accessible selected state and a visible treatment sourced from `primary.main` and, where a halo or tint is used, `custom.primaryBg`. Keyboard focus remains visible in both light and dark themes.
* Current remains read-only: node and edge activation retains its child-action and saved-diagram menu behavior, `drilldown: false` nodes remain non-interactive, and groups remain non-interactive.
* Direct selection changes no diagram object, geometry, edit change, viewport state, or comparison layout state.
* Replacing selection rerenders only leaves whose selected boolean changed. Clearing rerenders only previously selected leaves; diagram roots, collection hosts, and unrelated leaves do not rerender.

## State and rendering rule

A click invokes the selection service only. The clicked and previously selected leaves observe their own selected booleans; the diagram root, object collections, and unrelated objects do not subscribe to selection as a complete list and do not rerender.

## Dependencies

[F\_286](F_286_manage_active_diagram_tool.md) and [F\_290](F_290_add_diagram_selection_service.md).
