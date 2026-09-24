---
author: 
id: F_375
internalId: 4d894c57-e88c-49fc-8bb4-2533b8ee9ef6
title: Mindmap editing improvements
status: ready
owner: 
affects:
agents:
  - design/activity/card__4d894c57-e88c-49fc-8bb4-2533b8ee9ef6.json
policy:
after: c06d609b-025a-4540-a69a-ad451e272b15
changedFiles:
  - app/src/components/diagram_view/diagram_add_control.tsx
  - app/src/components/diagram_view/diagram_editor_integration.test.tsx
  - app/src/components/diagram_view/diagram_inline_metadata_field.tsx
  - app/src/components/diagram_view/diagram_inline_node_controls.tsx
  - app/src/components/diagram_view/diagram_legend.tsx
  - app/src/components/diagram_view/diagram_legend_details_editor.tsx
  - app/src/components/diagram_view/diagram_legend_entries.ts
  - app/src/components/diagram_view/diagram_legend_entry_list.tsx
  - app/src/components/diagram_view/diagram_legend_entry_row.tsx
  - app/src/components/diagram_view/diagram_menu_tab.test.tsx
  - app/src/components/diagram_view/diagram_menu_tab.tsx
  - app/src/components/diagram_view/diagram_node.test.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_session_legend_entries.test.tsx
  - app/src/components/diagram_view/diagram_session_legend_entries.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.test.tsx
  - app/src/components/diagram_view/diagram_zoom_viewport.tsx
  - app/src/components/diagram_view/editable_diagram.test.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/editable_diagram_node.tsx
  - app/src/components/diagram_view/use_diagram_tool.ts
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/stats_view/stats_content.test.tsx
  - app/src/components/stats_view/stats_menu_tab.tsx
  - app/src/services/diagrams/diagram_edge_drawing_service.test.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_geometry_service.test.ts
  - app/src/services/diagrams/diagram_group_drawing_service.test.ts
  - app/src/services/diagrams/diagram_group_drawing_service.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
  - app/src/services/diagrams/diagram_node_placement_service.test.ts
  - app/src/services/diagrams/diagram_node_placement_service.ts
  - app/src/services/diagrams/diagram_resize_service.test.ts
  - app/src/services/diagrams/diagram_resize_service.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
---
* When new diagram, in general, is created, switch app tab to diagram. It becomes available after switching to diagram view.
* On diagram menu:
  * Buttons are not grouped correctly, it should be;
    * Select, pan, add
    * Cut copy paste delete
    * Review, meta
* Legend should be editable inline, so&#x20;
  * \+ sign to right of ´legend´
  * Trashcan when mouse over on items
  * Edit label inline of item
  * Gear to modify style
* Add button needs improving:
  * It is part of the toggle group ´select´ and ´pan´. So 1 of the 3 is selected and remains selected. User can use same tool multiple times while selected. So while add is selected, user can continue adding objects of same type.
  * Label and icon are wrong. Drop label, icon should be that of selected tool.
* Touch is not correctly implemented. It is hard to drag objects with finger on mobiles
* Double click shows node details, that´s ok, but hrd to discover and limiting. Allow label to always be editable inline, show 3 dots icon when mouse over.
* Topics and roots dont have to be perfect round. Width can differ from height
* Curveture of connector should adjust according to relative position of nodes to each other: if ´from´ is below and to right of ´to´, curve is ok as is now. But if ´to´ would be below and to the right of ´from´, then curve should be opposite as is now.
* Diagram title and sub title should be inline editable ( for all diagrams)

## Current state

* Manual `New diagram` creation persists and activates a diagram, switches the workspace to Diagrams, and starts an edit session. Agent output also activates its new diagram record, but does not switch the workspace view.
* The Diagram menu places Select, Pan, and edit actions in one section and Add in another. Add shows a generic plus icon and text. Node placement and edge drawing return to Select after one object, although the edit session remembers the last Add choice.
* Legend entries appear on a floating panel. Their gear opens style controls, while adding, renaming, and removing explicit entries require the Legend details dialog. Entries derived from node roles or connection kinds are displayed when no explicit legend exists.
* Double-clicking an editable node opens its details dialog. The node label has no inline editor or hover action. `meta.title` and `meta.description` render as title and subtitle; both are edited in the Metadata details dialog.
* Pointer gestures support node movement, but touch dragging is unreliable. Mindmap roots and topics render as circles; resize locks width and height together. Curved connection geometry derives one control point from node positions and updates incident connections when nodes move.

## implementation details

* When a manual or agent-created diagram has persisted and become active, switch the workspace to Diagrams. Do this after successful creation, including child diagrams; failed creation must leave the current workspace view unchanged. Keep the manual creation edit-session behavior.
* Group Diagram menu controls in this order: Select, Pan, Add; Cut, Copy, Paste, Delete; Review, Metadata. Keep Legend access with the related metadata controls. Show Select, Pan, and Add as one exclusive persistent tool choice, with a selected state for the active tool. Add's main button uses the selected creation tool's icon and an accessible name, without the `Add` text; its dropdown still chooses the object type.
* Keep a valid Add tool active after placing a node or completing a connection, so repeated taps or clicks create the same type. Clear the in-progress preview between objects. Switch to Select or Pan only when chosen or when the Add tool becomes unavailable, such as Root after creating the only mindmap root. Escape cancels the current gesture without creating an object.
* Put a plus icon beside the Legend heading in edit mode to add an entry. In each editable legend row, expose a trash icon on hover or keyboard focus, edit its label in place, and retain the gear for role or connection style. Commit valid labels through edit-session legend operations; show validation feedback for blank labels. Materialize derived rows as explicit entries before editing or removing one. Preserve an explicit empty legend when the last row is removed; otherwise the current fallback to derived rows would make it reappear after save and reload.
* In edit mode, make node labels directly editable and expose a three-dot details button on hover or keyboard focus. Keep double-click opening details. Inline edits use the existing node-field mutation, validation, and change tracking; suppress selection, move, and edge gestures while the editor or button handles input. Provide touch and keyboard access without relying on hover.
* Make `meta.title` and `meta.description` directly editable on the New surface for every diagram type, using the same validation and edit-session metadata mutations as the details dialog. Keep description as the existing subtitle field; do not add another metadata field.
* Fix touch dragging at the zoom viewport and node hit target: one finger on a node starts a move with pointer capture, follows the finger at the current zoom, and finishes or cancels through the existing move service. Prevent native scrolling only for an active diagram gesture; preserve deliberate surface panning and scrolling. Do not start a move from an inline editor or action button.
* Allow mindmap root and topic width and height to change independently. Remove the square constraint from mindmap resize and circular presentation, render an ellipse when dimensions differ, and calculate connection endpoints at the ellipse boundary. Keep existing minimum-size validation and persist both dimensions through the existing node mutation path.
* Update the derived mindmap Bézier control point so the bend reverses for the opposite diagonal arrangement: when `from` lies below and right of `to`, preserve the current bend; when `to` lies below and right of `from`, bend to the opposite side. Recalculate incident paths and label positions after node move or resize. Keep curve data derived, with no new persisted fields.
* Add focused tests for creation navigation, tool persistence and grouping, inline edits and validation, touch move and cancellation, elliptical resize and endpoints, and both connection orientations. Run relevant app tests, type checking, and `npm run lint`.

## acceptance criteria

* After successful manual or agent diagram creation, Diagrams view opens with the created diagram active. Failed creation leaves prior view and active diagram unchanged. Manual creation still opens edit mode.
* Diagram menu presents Select, Pan, Add; Cut, Copy, Paste, Delete; then Review and Metadata in that order. Exactly one of Select, Pan, or Add is selected. Add shows selected tool icon without text; repeated placement or connection drawing works until user changes tool or that tool becomes invalid.
* In an edit session, legend heading has a plus icon. Each entry can be renamed inline, removed with a hover or focus trash icon, and styled through its gear. Changes to entries previously derived from objects persist after save and reload, including removal of the last entry. Blank labels cannot be saved.
* In an edit session, node labels, diagram title, and diagram subtitle can be edited in place. All diagram types support title and subtitle editing. Three-dot node action opens details by pointer, touch, or keyboard; double-click still opens details.
* A finger can drag a node accurately at normal and changed zoom. Ending gesture commits movement; cancellation does not. Surface pan and scroll remain usable, and editor interactions do not move nodes.
* Mindmap roots and topics can have different width and height and render as ellipses. Connections meet ellipse boundaries after resize. The two specified diagonal arrangements bend to opposite sides, and connection labels follow updated curves.
* Focused app tests, type checking, and `npm run lint` pass.
