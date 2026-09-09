---
author: 
id: F_342
internalId: 6a4ede44-a6e7-44d0-afdc-3230b6595822
title: diagrams emphasize related objects and connections
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__6a4ede44-a6e7-44d0-afdc-3230b6595822.json
policy:
after: 2f6108ac-7b47-4374-a2c6-292b5871b064
---

we need to improve the diagrams a little bit:

* first, for both static and editable diagrams, when clicking on an item: it should select it. for editable diagrams, this is already ok I think, but static diagrams open the context menu. instead, a click should select it, a right click opens the context menu
* we need to add an item to the context menu: emphasize, which changes the diagram by making all non-related object almost fully transparent so that only the selected object and everything that is related to it (nodes and edges) remain normal.
  to exit this state, user can:
  * press escape
  * click on the X that we show in the right upper corner of the diagram while in this mode.

## Current state

* Current is the immutable loaded diagram; New is the editable copy owned by `DiagramEditSessionService`.
* Current node and edge click, Enter, and Space call `DiagramView.handleDiagramSelect`, which immediately opens `DiagramItemMenu`. Right-click has no application handler, and Current has no selected-object state or selected styling.
* New node, edge, and group click already updates `DiagramSelectionService`; Ctrl-click toggles membership, blank-surface click clears it, and selected leaves render `aria-pressed` plus a theme-backed outline. Right-click still opens the browser menu.
* `DiagramItemMenu` contains `Actions` and `Saved diagrams` submenus. `DiagramViewService` owns its state, but that state identifies neither object kind nor Current/New surface. No emphasis state, relation query, dimmed presentation, close control, or Escape behavior exists.
* `DiagramSelectionService` cannot own Current selection because it validates identities against an active edit session. `DiagramNode` and `DiagramEdge` are shared by Current and New, while editable leaves supply New-specific selection behavior.

## Implementation details

* In this feature, **directly related** means one graph hop, never a transitive walk. Emphasizing a node keeps that node, every edge whose `from` or `to` equals its ID, and each opposite endpoint node at normal opacity. Emphasizing an edge keeps that edge plus its `from` and `to` nodes. Self-loops and duplicate endpoints appear once.
* Keep Current selection as service-owned view state and retain `DiagramSelectionService` for New. Use stable `{ objectKind: 'node' | 'edge', objectId }` identities. Do not use labels or paths as identity, and do not add groups to emphasis scope.
* Split shared node/edge interaction into plain selection and context-menu activation. Current plain click, Enter, or Space selects without opening a menu. New keeps existing Select-tool, Ctrl-click, group-selection, and blank-surface behavior. Right-click prevents the browser menu and opens the application menu for the target node or edge on either surface.
* Extend diagram-menu state with object kind and surface. Add top-level `Emphasize`; Current keeps the existing `Actions` and `Saved diagrams` submenus, while New exposes `Emphasize` only. This intentionally changes F_343's Current top-level menu from two items to three. Choosing it closes the menu and starts or replaces emphasis for its context target.
* Add an `EventTarget`-based emphasis service owning one active `{ diagramId, surface, objectKind, objectId }` target. Derive retained node and edge IDs from Current `PositionedDiagramData` or New service-owned `DiagramData`. Recompute after relevant New edge endpoint or collection changes; clear if the target disappears, the source diagram changes, navigation leaves it, or the edit session ends.
* While emphasis is active, activating another node or edge moves the emphasis target and recomputes its one-hop set without leaving the mode. Selection and emphasis remain view data: neither changes `DiagramData`, geometry, dirty state, change descriptions, zoom, pan, or comparison layout.
* **Almost fully transparent** means opacity `0.08`, stored in a named presentation constant. Nodes and edges outside the retained set, plus group boxes and sequence-only diagram decorations, use that opacity. Retained nodes and edges, diagram text outside the drawing surface, legend, menus, selection/focus indicators, and controls remain normal. Dimmed content stays pointer- and keyboard-operable.
* Render an accessible close `IconButton` at the upper-right of the active Current or New viewport, outside the scaled and scrollable drawing surface. Give it tooltip and label `Exit emphasis`. Unhandled Escape clears emphasis; an open menu, dialog, or active edit gesture keeps its existing first-Escape behavior.
* Preserve granular rendering. Each affected leaf or decoration subscribes only to its own normal/dimmed snapshot. Emphasis changes rerender visual elements whose opacity changes, not diagram roots, comparison layouts, toolbox, or unrelated application UI.
* Verified shared call-site behavior: `Diagram` changes Current node/edge activation from menu opening to Current selection; editable node/edge leaves keep New selection and gain context-menu activation. Current groups remain non-interactive; editable groups keep existing selection behavior and receive no `Emphasize` menu.

## Acceptance criteria

* Plain click, Enter, or Space selects a Current node or edge without opening `DiagramItemMenu`. Existing New node, edge, group, Ctrl-click, and blank-surface selection behavior remains unchanged.
* Right-clicking a Current or New node or edge opens the application context menu at the pointer and suppresses the browser menu. Current offers `Emphasize`, `Actions`, and `Saved diagrams`; New offers `Emphasize`.
* Emphasizing a node leaves only that node, its incident edges, and their opposite endpoint nodes at normal opacity. Emphasizing an edge leaves only that edge and its two endpoint nodes at normal opacity. No second-hop node or edge remains normal.
* Every other drawing object uses opacity `0.08`; dimmed objects remain focusable and clickable. Selection and keyboard-focus indicators remain clearly visible in light and dark themes.
* Selecting another node or edge while emphasis is active moves emphasis to that object. Choosing `Emphasize` from another context menu also replaces the target; neither action exits the mode.
* `Exit emphasis` appears at the active viewport's upper-right and remains visible while its diagram is zoomed, panned, or scrolled. Clicking it or pressing an otherwise unhandled Escape restores normal opacity and removes the control.
* Navigation, source replacement, edit-session end, or deletion of the emphasized New object clears emphasis. Relevant New edge reconnection, addition, or removal updates the retained one-hop set immediately.
* Selection and emphasis do not mutate diagram model data or change dirty state, change descriptions, geometry, viewport state, or comparison layout state.
* Focused relation, service, context-menu, Current-renderer, editable-leaf, Escape, cleanup, and render-isolation tests pass; app lint passes.
