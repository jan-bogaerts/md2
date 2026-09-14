---
author: 
id: F_351
internalId: 19a0dd49-b8f7-4dbb-a6a6-eb515260dacd
title: Formatting diagram items
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__19a0dd49-b8f7-4dbb-a6a6-eb515260dacd.json
policy:
changedFiles:
  - app/src/components/diagram_view/current_diagram_edge.tsx
  - app/src/components/diagram_view/current_diagram_node.tsx
  - app/src/components/diagram_view/diagram.tsx
  - app/src/components/diagram_view/diagram_connection_formatting_popover.tsx
  - app/src/components/diagram_view/diagram_connection_marker.tsx
  - app/src/components/diagram_view/diagram_edge.tsx
  - app/src/components/diagram_view/diagram_edge_style.node.test.ts
  - app/src/components/diagram_view/diagram_edge_style.ts
  - app/src/components/diagram_view/diagram_entity_field.tsx
  - app/src/components/diagram_view/diagram_font_style.ts
  - app/src/components/diagram_view/diagram_formatting_controls.tsx
  - app/src/components/diagram_view/diagram_formatting_popover.tsx
  - app/src/components/diagram_view/diagram_formatting_scale_control.tsx
  - app/src/components/diagram_view/diagram_group.tsx
  - app/src/components/diagram_view/diagram_legend.tsx
  - app/src/components/diagram_view/diagram_legend_connection_sample.tsx
  - app/src/components/diagram_view/diagram_legend_entry_list.tsx
  - app/src/components/diagram_view/diagram_legend_entry_row.tsx
  - app/src/components/diagram_view/diagram_menu_tab.test.tsx
  - app/src/components/diagram_view/diagram_menu_tab.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_role_style.ts
  - app/src/components/diagram_view/diagram_session_legend_entries.test.tsx
  - app/src/components/diagram_view/diagram_session_legend_entries.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/editable_diagram.tsx
  - app/src/components/diagram_view/editable_diagram_edge.tsx
  - app/src/components/diagram_view/editable_diagram_entity_field.tsx
  - app/src/components/diagram_view/editable_diagram_entity_fields.tsx
  - app/src/components/diagram_view/editable_diagram_fragment.tsx
  - app/src/components/diagram_view/editable_diagram_group.tsx
  - app/src/components/diagram_view/editable_diagram_leaves.test.tsx
  - app/src/components/diagram_view/editable_diagram_node.tsx
  - app/src/components/diagram_view/sequence_fragment.tsx
  - app/src/components/diagram_view/use_diagram_formatting.ts
  - app/src/services/diagrams/diagram_change_descriptions.node.test.ts
  - app/src/services/diagrams/diagram_change_descriptions.ts
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_edge_drawing_service.ts
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_formatting.ts
  - app/src/services/diagrams/diagram_geometry_service.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
  - app/src/services/diagrams/diagram_save_service.test.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - shared/diagram_data.d.mts
  - shared/diagram_data.mjs
after: 7587f168-1106-4f87-b705-a38eab8717f4
---
We need to add the ability to modify formatting of the items on the diagrams. This can be done by:

* When mouse is over legend item, show gear icon. This opens a popup with formatting inputs on.
* On diagram menu tab:
  * Increase, decrease font size
  * Increase, decrease size of boxes (in %)
  * Space closer or further appart.

Formatting inputs:

* Font: family, size, bold, italic, underline, color
* Box:
  * Border: color, style, thickness corner radius
  * Center: fill color, layout pos: top, left, bottom, center, top  right.
* Connections:
  * Line: thickness, color
  * Connection start and end style (arrow, ...)

Formatting can be done on editable and readonly diagrams.

Formatting info is saved in diagram json. Regular commit batcher is used.

## Current state

Diagram JSON has no formatting fields. `parseDiagramData` and `serializeDiagramData` preserve only metadata, nodes, edges, groups, fragments, and geometry. Node appearance comes from `diagramRoleStyle`, connection appearance from `diagramEdgeStyle`, and group appearance from fixed component styles. Font sizes and Dagre, sequence, and group spacing are fixed constants.

Legend rows render role or connection-kind samples but have no formatting action. Diagram menu contains editing, creation, and comparison controls only. Current diagrams expose no style mutation or file-save operation; New diagrams can change model fields through `DiagramEditSessionService` and persist an edited copy through `DiagramSaveService`. `DataService.scheduleFileCommit` already queues arbitrary files in `CommitBatcher`.

Here, **semantic category** means one node role or one connection kind. Formatting a category affects every matching node or connection. **Readonly** means node and edge content cannot change; formatting and layout metadata may change.

## implementation details

* Extend shared diagram schema with optional top-level `formatting`. Omission keeps current rendering. Store diagram-wide `fontScalePercent`, `boxScalePercent`, and `spacingScalePercent`; node-role overrides; and connection-kind overrides. Reject unknown category keys, unsupported enum values, non-finite or out-of-range numbers, and colors outside `#RRGGBB` format.
* Node-role override contains font family, size, bold, italic, underline, and color plus box fill color, border color/style/thickness/radius, and content position. Content position uses full 3x3 set: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, and bottom-right.
* Connection-kind override contains label font settings, line thickness and color, plus start and end marker. Supported markers are none, filled arrow, open arrow, circle, and diamond. Missing override fields fall back to current theme and role/kind rules.
* Add focused formatting operations and scoped `EventTarget` events to service owning each surface. Current and New remain independent: Current updates active source diagram's formatting only; New updates editable copy's formatting, dirty state, and semantic change set. Neither path mutates node, edge, group, fragment, or explicit geometry data.
* For Current, serialize canonical diagram after each applied formatting transaction and call `DataService.scheduleFileCommit` for active `DiagramRecord.path`; do not force an immediate flush. Repeated changes therefore coalesce in regular `CommitBatcher`. For New, persist formatting with existing Save edited copy flow because New has no file path before first save; that flow already writes through same batcher.
* Keep active diagram identity unchanged when Current formatting changes, so an active edit session is not discarded. Commit failure keeps batch pending and reports through existing persistence error path. Navigation must not redirect a pending change to another diagram path.
* Show opacity-hidden gear button on each legend row during hover and `:focus-within`; keep button in layout. Gear has tooltip and accessible name containing entry label. Current and New legend tabs target their respective surface. Opening gear shows MUI popover with fields valid for category: font and box fields for node roles; font and connection fields for connection kinds. Popover owns a draft; Apply validates and performs one transaction, while Cancel changes nothing.
* Add labelled Diagram-menu controls for font, box, and spacing percentages. Use named 10-percentage-point step and 50%-200% bounds. Disable decrease/increase at respective bound and show current percentage. Global font scale affects diagram item text, not menu or legend UI text.
* Apply box scale to every resolved node width and height, including explicit sizes, without changing persisted node geometry. Apply spacing scale only to automatic Dagre, sequence, and group gaps; explicit node coordinates and edge waypoints stay authoritative. Recompute affected derived geometry and edge routes after global box or spacing changes.
* Render role formatting in every matching node shape and its legend sample. Render connection-kind formatting in every matching edge and its legend sample. Font settings also apply to matching node content or connection labels. Group, fragment, entity-field, cardinality, and other diagram text use diagram-wide font scale.
* Preserve granular rendering: category changes notify only matching leaves and legend samples. Global font change notifies text leaves; box or spacing change may invalidate full derived layout because every auto-positioned item can move. Do not publish a replacement diagram merely to announce a style change.
* Add parser/serializer, formatting-service, Current persistence, edit-session change tracking, layout, legend popover, menu-control, node/edge/group rendering, marker, focus/keyboard, bounds, Current/New isolation, and focused rerender tests. Run related app tests and app lint.

## acceptance criteria

* Diagram JSON with valid formatting round-trips unchanged; a diagram without formatting renders exactly as before. Invalid formatting fails with field-specific `Malformed diagram data` error.
* Hovering or focusing any derived or explicit legend row reveals accessible gear action. Node-role gear edits every node sharing that role; connection-kind gear edits every connection sharing that kind. Unrelated categories do not change.
* Node popup provides all requested font and box fields plus nine content positions. Connection popup provides requested font and line fields plus none, filled arrow, open arrow, circle, and diamond start/end markers.
* Apply updates matching diagram and legend samples immediately. Cancel changes nothing. Formatting Current never mutates node/edge content or ends active edit session; formatting New never changes Current.
* Diagram menu changes font, box, and spacing scales in 10-point steps within 50%-200%, displays current values, and disables controls at bounds.
* Box scaling changes rendered box dimensions and reroutes incident connections without changing persisted node width or height. Spacing scaling changes automatic layout gaps but not explicit coordinates or waypoints.
* Current formatting serializes to active diagram path and enters regular commit batch. Rapid changes to same diagram coalesce. New formatting marks edit session dirty, appears in semantic change review, and is saved in edited-copy JSON through existing save flow.
* Failed persistence reports error and retains pending Current change for retry. Switching diagrams cannot save pending formatting under wrong path.
* Keyboard users can reach gear and all popup/menu controls; every icon-only action has tooltip and accessible name. Popup follows app theme and uses no hardcoded component colors.
* Changing one category rerenders only matching diagram leaves and legend samples. Global layout controls may rerender all derived geometry; unrelated menu and dialog components do not rerender.
