---
author: 
id: F_368
internalId: 530bdc1a-985f-434a-bfe7-acb2f7ca06b8
title: add mindmaps to diagrams
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__530bdc1a-985f-434a-bfe7-acb2f7ca06b8.json
policy:
---
we already have a number of different diagrams that we support. 1 more should be added: mindmaps.

These should support:

* nodes: text in a circle
* connections: curved line between nodes, the line should always be behind the nodes if a node is in the way of the connection. a connection should also support text.

We should support both read-only, rendered by an agent as well as in edit mode.

## Current state

Diagram JSON supports `architecture`, `dependency`, `sequence`, `flow` and `entity`. `shared/diagram_data.mjs` validates their metadata, node and edge kinds, references and geometry; `shared/diagram_data.d.mts` exposes matching TypeScript types. Agent instructions in `shared/project_config_defaults.mjs` list the same contract.

`diagram_layout.ts` uses Dagre for every non-sequence diagram. It produces rectangular node geometry, orthogonal edge routes and edge-label positions. `DiagramRenderer` selects one thin type renderer, while shared node and edge components render both the read-only and editable surfaces. Edges already render below nodes through their surface stacking order, so a node visually covers a connection that passes behind it.

Edit mode uses the same canonical `DiagramData`. `diagramCreationTools` exposes type-specific node and edge tools; placement, drawing, mutation validation and `DiagramGeometryService` update only affected objects. Current connection points describe rectangle sides, edge previews and persisted waypoints are orthogonal, and node resize permits different width and height. Those rules do not produce circular nodes or curved connections.

Empty-diagram creation already derives its menu from `EMPTY_DIAGRAM_CHOICES`, but Mindmap is not present. [F\_369](F_369_allow_users_to_add_new_empty_diagrams.md) depends on this feature and expects Mindmap as a creation choice.

## implementation details

* Add `mindmap` to `DIAGRAM_TYPES` and the TypeScript declaration. Add node kinds `root` and `topic`; mindmaps allow only those kinds and `connection` edges. A non-empty mindmap must contain exactly one explicit `root`; an empty mindmap remains valid for F\_369. Labels remain required on nodes and optional on connections. Groups remain supported. Entity fields, cardinalities, flow presets, sequence fragments, persisted waypoints and rectangle-side connection points are invalid on mindmaps.
* Define **radial layout** as concentric rings around the root. Put the root at the surface centre. Assign connected topics to rings by shortest undirected connection distance from the root, order peers deterministically by node-array order, and place disconnected topics on deterministic outer rings. Persisted node positions remain authoritative. This rule keeps a topic valid while a user places it before drawing its connection.
* Give root and topic nodes equal width and height and render their text inside a circle. Named root/topic diameter constants provide missing sizes. Mindmap geometry validation requires supplied width and height together and requires them to be equal. Resize keeps the aspect ratio locked and writes both fields in one mutation.
* Add mindmap edge geometry separate from orthogonal graph routing. Resolve endpoints where the centre-to-centre line meets each circle and derive one quadratic Bézier control point per connection. **Curved connection** means the rendered SVG path uses that control point; curve data is derived and never persisted. Place an optional label at the curve midpoint with the existing themed background.
* Keep mindmap connections directed: `from` is the source, `to` is the target, and the curved line renders the existing filled end arrow at the target by default. Connection formatting may override its markers. Keep connection SVG below node components. **Behind a node** means a crossing line is visually occluded by the node because the edge layer has lower stacking order; it does not mean rerouting the curve around that node.
* Add a thin `MindmapDiagram` renderer and select it explicitly in `DiagramRenderer`; do not let an unknown type fall through to `EntityDiagram`. Extend shared node, edge, path and preview components with explicit mindmap presentation inputs so architecture connections keep their current rectangular and arrowed behavior.
* Add Root, Topic and Connection to the mindmap Add menu. Root is available only while no root exists; Topic is available after the root exists. Mindmap edge drawing shows the same curved preview used after creation and stores only `from`, `to`, `kind` and optional label. Prevent deleting the root while topic nodes remain. Selection, movement, copy, paste, details, formatting, groups, drill-down, comparison, review and save-copy behavior otherwise remain shared.
* Extend `DiagramGeometryService` with mindmap-specific incremental updates. Moving or resizing one node recalculates only that node, its incident curves and labels, and changed surface bounds. Adding or removing a connection may change ring assignment, so recalculate positions only for nodes whose derived ring or angle changed; never replace the canonical diagram or publish a whole-diagram event.
* Add Mindmap to `EMPTY_DIAGRAM_CHOICES` with title `New mindmap` and description `New mindmap diagram`. Update the default agent diagram footer and the editable-diagram contract's supported-type wording and mindmap rules.
* Add parser and serializer tests for valid empty and populated mindmaps, root count, allowed kinds, forbidden fields and circular dimensions. Add layout tests for deterministic rings, explicit positions, disconnected topics, circle endpoints, curves and labels. Add read-only and edit-mode component tests for circles, edge layering, optional connection text, creation tools, curved previews, root deletion protection, resize locking, granular geometry events and the New diagram choice. Run focused tests, app type checking and `npm run lint`.

## acceptance criteria

* Agent-produced and saved JSON with `meta.type: "mindmap"` parses, serializes, loads and renders in read-only and edit modes. Empty mindmaps are valid; every non-empty mindmap has exactly one `kind: "root"` node and all other nodes use `kind: "topic"`.
* Without persisted positions, the root renders at the centre, connected topics render on deterministic concentric rings by distance from the root, and disconnected topics render on deterministic outer rings. Persisted positions remain unchanged.
* Every mindmap node renders as a circle containing its text. Persisted dimensions are equal, and resizing keeps width and height equal.
* Every mindmap connection renders as a directed curved line between circle boundaries, with a filled arrow at its target unless formatting overrides the markers. Optional connection text renders at the curve midpoint. Connections remain below nodes, so nodes cover crossing line segments.
* Edit mode offers Root, Topic and Connection tools with a curved connection preview. It prevents a second root and prevents root deletion while topics remain. Existing selection, move, copy, paste, formatting, grouping, drill-down, review and save-copy flows work for mindmaps.
* Creating a new empty Mindmap through desktop or mobile creation UI writes valid JSON, activates it and starts edit mode under the existing F\_369 flow.
* Existing architecture, dependency, sequence, flow and entity parsing, layout, rendering and editing behavior remains unchanged.
* Focused diagram tests, app type checking and `npm run lint` pass.
