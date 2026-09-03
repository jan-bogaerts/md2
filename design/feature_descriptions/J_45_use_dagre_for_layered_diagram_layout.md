---
author:
id: J_45
internalId: 4d275542-e6f6-493e-9cb4-d75cbb83cea7
title: use Dagre for layered diagram layout
status: ready for implementation
owner:
affects:
agents:
policy:
changedFiles:
  - app/package-lock.json
  - app/package.json
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
---
Replace the hand-written layered node ranking and ordering with [Dagre](https://github.com/dagrejs/dagre). Improve automatic layouts without changing the diagram data contract or renderer.

## Current state

`layout()` in `app/src/services/diagrams/diagram_layout.ts` is the only production entry point. `DiagramViewService` calls it after parsing diagram JSON; tests and render tests call it directly.

For architecture, dependency, flow, and entity diagrams, `graphComponents`, `graphRanks`, `orderedRankNodes`, and `layoutLayeredNodes` calculate ranks and positions. Sequence diagrams use separate deterministic column and row calculations. The remaining layout code owns node sizes, explicit geometry, orthogonal edge routing, connection points, labels, groups, sequence activations and fragments, and surface bounds.

The current ordering heuristic considers only parents in the previous rank. It does not perform the repeated crossing reduction and coordinate assignment provided by a dedicated layered-layout engine.

## Implementation details

* Add the maintained `@dagrejs/dagre` package to `app` runtime dependencies.
* Keep the synchronous `layout(data) => PositionedDiagramData` interface.
* Use Dagre only inside layered node placement. Remove `graphComponents`, `graphRanks`, `incomingEdges`, and `orderedRankNodes` after their sole caller is replaced.
* Build one Dagre graph from diagram node identifiers, resolved node widths and heights, and edges. Exclude self-edges and edges whose kind is `cycle`; those edges must not influence ranks.
* Configure top-to-bottom layout with existing `NODE_GAP`, `RANK_GAP`, and `SURFACE_PADDING` values. Keep stable input order so identical data produces identical output.
* Dagre returns node centres. Convert them to top-left coordinates and snap computed coordinates to `GRID_SIZE` before creating `PositionedDiagramNode` values.
* Continue applying each supplied `x`, `y`, `width`, and `height` as authoritative. Dagre may calculate candidate geometry for the complete graph, but only missing fields are filled. Fully positioned diagrams therefore keep every node coordinate.
* Ignore Dagre edge points. Existing routing remains responsible for explicit waypoints, connection-point attachments, fan-out ports, orthogonal paths, cycle routes, self-loops, crossing hops, and labels.
* Leave sequence placement, group layout, activations, fragments, surface sizing, rendering components, schema, persistence, and diagram JSON unchanged.

This job follows [F\_278](../feature_descriptions/F_278_make_diagram_layout_compatible_with_editing.md). Dagre placement must preserve that job's model-versus-derived geometry rules and independently stored group geometry.

## Edge cases and failure modes

* Disconnected nodes and disconnected subgraphs receive finite, non-overlapping automatic positions.
* Ordinary cyclic input relies on Dagre's cycle handling. Explicit dependency `cycle` edges remain presentation edges and do not change node placement.
* Mixed explicit and automatic coordinates may constrain only one axis. Preserve each supplied axis independently; do not add a fallback mode or rewrite persisted geometry.
* Empty and single-node diagrams still produce valid surface bounds.
* Dagre failure is a layout failure. Do not silently return the old algorithm or partially positioned data.

## Tests

Update `diagram_layout.node.test.ts` to cover:

* deterministic top-to-bottom placement and four-pixel snapping;
* fewer crossings for a graph where the current one-pass ordering performs poorly;
* disconnected, cyclic, empty, and single-node graphs;
* explicit and mixed node geometry preservation;
* unchanged sequence layout and supplied waypoint behavior;
* the existing 100-node and 150-edge performance bound.

Run the focused layout test, `npm run test -- src/services/diagrams/diagram_layout.node.test.ts`, then `npm run lint` from `app`.

## Acceptance criteria

1. Architecture, dependency, flow, and entity diagrams use Dagre for missing node positions.
2. Identical input produces identical positioned nodes.
3. Computed coordinates stay on the four-pixel grid and respect configured node and rank gaps.
4. Explicit node geometry and valid supplied edge routes remain authoritative.
5. Existing edge routing and all sequence-diagram geometry remain outside Dagre and retain current behavior.
6. Explicit `cycle` edges and self-edges do not distort automatic ranks.
7. Existing renderers and `DiagramViewService` require no interface changes.
8. Focused tests and app lint pass.

## Out of scope

Using Dagre edge routes, changing layout direction, adding user-selectable layout settings, changing diagram schema, and replacing the editor's persisted-versus-derived geometry rules.