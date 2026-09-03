---
author:
id: F_329
internalId: ce85fbc0-d5c2-4de1-a867-24325cbbd471
title: make diagram edit updates granular
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__ce85fbc0-d5c2-4de1-a867-24325cbbd471.json
policy:
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

This is a corrective follow-up for the already implemented [F\_273](F_273_define_editable_diagram_contract.md), [F\_274](F_274_add_editable_connection_points.md), and [F\_275](F_275_add_diagram_edit_session_service.md). Do not rewrite their completed records.

## Goal

Replace whole-diagram publication and recomputation with stable service-owned objects, field assignment, identity-scoped events, and leaf subscriptions before diagram mutation UI is implemented.

## Current state

`DiagramEditSessionService` owns `editableDiagram: DiagramData` and exposes `getEditableDiagramSnapshot` plus one `editableDiagramChanged` event. `start()` deep-clones the source once, which is acceptable session initialization, but the API gives future components only a complete diagram snapshot to observe. Any mutation implemented against that API would need to replace the diagram reference to wake React, rebuilding and rerendering the complete diagram.

The editable-diagram contract created by F\_273 says derived `PositionedDiagramData` is recomputed after a mutation and defines dirty by comparing the complete editable diagram with the original. Both rules scale with total diagram size instead of the changed field.

The current renderer also passes complete positioned data from `DiagramView` through `DiagramRenderer` and `Diagram` into mapped node, edge, and group children. This is acceptable for loading an immutable viewed diagram, but it is not the update path for New: changing one value above `Diagram` would rerender the parent and every mapped child.

Production call sites of the implemented edit-session service are currently limited to `ProjectLoading.bindProject` and `ProjectLoading.clear`; no component consumes its diagram snapshot yet. These lifecycle call sites keep their behavior. The service API can therefore be corrected before F\_276 and the editor components depend on it.

## Implementation details

* Update `design/architecture/editable_diagram_contract.md`: a session may clone the source once at start and serialize once at save, but ordinary edits mutate the owned canonical object in place by assigning only requested fields. Remove whole-diagram equality checks and whole-layout recomputation from the edit path.
* Remove the complete editable-diagram subscription as the UI update mechanism. Keep a read-only complete-diagram accessor only for persistence and agent/change processing boundaries; React components must not subscribe to it.
* Add identity and field accessors for metadata, nodes, edges, groups, fragments, entity fields, and connection points. A setter assigns the existing object's field. It must not use object spread, `map`, `structuredClone`, or array replacement for a field edit.
* Use the service's `EventTarget` for scoped events. Event scope includes object kind, stable object ID, and the changed field. Collection-membership events are separate and fire only when an object is added, removed, or reordered.
* Services own stable view data needed by React. Expose primitive field snapshots and stable references. Expose node, edge, group, and fragment ID-list snapshots whose references change only when membership or order changes, never when a member field changes.
* Leaf components use `useSyncExternalStore` to subscribe to the smallest field or stable view reference they render. A node label component observes that node's label; an edge observes its own fields and route; metadata observes title or description. Collection hosts observe only ID lists and render leaves by ID.
* Diagram roots, comparison roots, pane layouts, and toolbox roots do not subscribe to a complete `DiagramData`, `PositionedDiagramData`, or catch-all change event. They compose stable child hosts only.
* Dirty is updated from semantic change tracking. A mutation sets or clears the affected change entry; it does not compare, clone, stringify, parse, or serialize the complete diagram.
* Initial full layout remains allowed when a diagram is loaded. Incremental derived-geometry ownership is completed by F\_278; this card establishes the service/event boundary it uses.

## Call-site behavior

* `ProjectLoading.bindProject` and `ProjectLoading.clear` keep their existing lifecycle behavior.
* F\_276 mutation operations receive the new field-assignment and scoped-event API.
* F\_277 consumes scoped mutations rather than diffing complete diagrams.
* F\_278 updates only affected derived geometry.
* F\_280 and later UI jobs render stable collection hosts and subscribing leaf components instead of passing complete diagram objects through props.
* F\_327 may read and serialize the complete canonical diagram because saving is a persistence boundary; it must not publish that read as an application-state update.

## Acceptance criteria

1. Starting a session may create one editable copy; changing a field afterward preserves the `DiagramData` object, its collections, the changed owner object, and every unrelated object by reference.
2. Updating one node label performs one field assignment and dispatches only that node-label event. It does not dispatch diagram, node-list, unrelated-node, edge, group, layout-root, or session events.
3. Adding or removing a node dispatches the node-membership event and affected reference events; it does not republish existing nodes.
4. React snapshots are primitives or stable references derived from service data, never revision counters and never cloned complete objects.
5. A node field update rerenders the leaf that displays that field. Diagram View, comparison panes, diagram root, node collection, unrelated nodes, edges, and groups do not rerender.
6. A node position change updates that node and its incident derived edge routes only. It does not execute full `layout()` or reroute unrelated edges.
7. Dirty and the change set update from the affected semantic change without complete-diagram comparison, cloning, stringifying, parsing, or serialization.
8. Full-diagram traversal is confined to load, explicit validation where required at a persistence boundary, save serialization, and generation of requested final output; it is absent from ordinary field edits.
9. Existing project bind, clear, session start, discard, and source-change behavior remains covered and unchanged.
10. Focused render-count tests prove that changing a field in one child does not rerender root, parent, collection, or sibling components.

## Dependencies

[F\_275](F_275_add_diagram_edit_session_service.md). This card must land before F\_276 and every remaining F\_255 implementation job.