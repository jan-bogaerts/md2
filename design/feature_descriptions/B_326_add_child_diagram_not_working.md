---
author: 
id: B_326
internalId: 204e1fa2-8e5e-4fd1-b63c-06c9c762c080
title: add child diagram not working
status: ready
owner: 
affects:
agents:
  - design/activity/card__204e1fa2-8e5e-4fd1-b63c-06c9c762c080.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
branch: b_326_add_child_diagram_not_working
worktree: 2
changedFiles:
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/diagram_view/surface/diagram_breadcrumb_bar.test.tsx
  - app/src/components/diagram_view/surface/diagram_breadcrumb_bar.tsx
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
---

While in diagram-view mode, editing a mind map, I have a node selected, then want to use the + sign next to the breadcrumbs -bar, but this is disabled. don't know why.&#x20;

I believe it should be possible to add sub diagrams also from mind maps.

## Current state

The breadcrumb **Add child diagram** button observes only the selected item in the saved Current diagram. Editing uses `DiagramSelectionService`, which owns a separate selection for the editable New diagram. Selecting an editable node therefore does not enable the button. This affects every editable diagram type, not only mind maps.

Child diagrams are indexed by a persisted parent diagram ID and item ID. A newly added editable item cannot be a child-diagram parent until the edited copy containing it has been saved and opened.

## Implementation details

* Pass `DiagramSelectionService` to `DiagramBreadcrumbBar` and subscribe to its selection with `useSyncExternalStore` while the active diagram is being edited.
* When the editor selection is non-empty, enable the button only when exactly one selected node or connection has the same ID and kind in the saved Current diagram. Resolve its label from Current so the child context matches its persisted parent. A group, multiple selection, or newly added item remains ineligible.
* When the editor selection is empty, retain the existing Current-selection behavior.
* Open the child action through `DiagramViewService` with the resolved persisted parent. The service must validate that the diagram is active and that the item still exists before creating the child context. Do not copy editor selection into the service's Current selection state.
* Update the breadcrumb and view-service tests. Cover an existing editable mind-map node, another diagram type, Current-selection fallback, multiple selection, group selection, a newly added item, and a stale or missing persisted item.

## Acceptance criteria

* Selecting one existing node in an editable mind map enables **Add child diagram** and opens a child action for that node in the active persisted diagram.
* The same behavior works for one existing node or connection in every supported editable diagram type.
* With no editor selection, a valid Current selection continues to enable the button and open the child action.
* The button is disabled when the editor selection contains multiple objects, a group, or an item that does not exist in Current.
* A newly added editable item cannot receive a child diagram until the edited copy containing it is saved and opened.
* The child action uses the persisted parent diagram ID, item ID, and Current item label.
