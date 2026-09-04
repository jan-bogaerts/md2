---
author:
id: F_280
internalId: acc5894b-b0b6-4024-88fe-be8f89ccfa36
title: add current and new diagram comparison
status: new
owner:
affects:
agents:
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Render the immutable current diagram and editable new diagram in one comparison surface.

## Scope

* Add labelled Current and New regions to Diagram View.
* Keep the comparison root responsible only for layout and stable service references. It does not subscribe to either complete diagram.
* Render Current from its immutable loaded source. Render New through service-bound collection hosts and leaves, not by passing complete `DiagramData` or `PositionedDiagramData` through `DiagramRenderer` and `Diagram` props.
* Node, edge, group, fragment, metadata, and surface-size leaves subscribe with `useSyncExternalStore` to the smallest primitive or stable reference they render.
* Collection hosts subscribe only to stable ID-list snapshots. A member field event does not change those snapshots.
* Keep Current read-only and direct editing tools to New only.
* Preserve breadcrumbs, action menus, loading, empty, and error states.

## Acceptance criteria

* Current never changes during an edit session.
* Every accepted edit appears in New immediately.
* Existing diagram navigation works when no edit session is active.
* Changing one New node label rerenders that node leaf only; comparison root, pane layout, diagram root, collection hosts, Current, siblings, edges, and groups do not rerender.
* Adding a node rerenders the New node collection host and creates one leaf without rerendering existing leaves.
* Changing comparison mode rerenders the component that owns that layout but does not publish diagram state.

## Dependencies

[F_329](F_329_make_diagram_edit_updates_granular.md) and [F_278](F_278_make_diagram_layout_compatible_with_editing.md).
