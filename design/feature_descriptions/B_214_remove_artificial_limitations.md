---
author: 
id: B_214
internalId: 6f26ee8a-2ac0-4b8b-aad9-2953cbf7dcc1
title: remove artificial limitations
status: ready
owner: 
affects:
agents:
  - design/activity/card__6f26ee8a-2ac0-4b8b-aad9-2953cbf7dcc1.json
policy:
after: 0d606964-ffae-4742-8986-6bdb592488ff
changedFiles:
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_data.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
---

apparently, the implementation of the diagram display introduced limitations that were not asked for:&#x20;
`The implementation limits diagrams to 9 nodes and 12 edges, except entity diagrams allow 8 nodes, sequence diagrams 5 participants, and dependency diagrams 14 edges. Architecture allows 3 groups. These limits are enforced in diagram_data.ts`

this is not acceptable. the diagrams should be allowed to have any size.

first: is there a technical reason why this was introduced (not because it was in the design spec, cause it was not in the original, not in git, if it is in there, you put it there without my approval).

second, if there is a technical reason: work out a better way.

finally: remove the limitations

## Current state

The limits are real, undocumented, and were never requested. They live in two files.

`app/src/services/diagrams/diagram_data.ts` declares eight constants and enforces them at the end of `parseDiagramData`, inside `validateComplexity` and `validateSequenceFragments`:

* `MAX_NODES = 9`, lowered to `MAX_ENTITY_NODES = 8` for entity diagrams and `MAX_SEQUENCE_NODES = 5` for sequence diagrams.
* `MAX_EDGES = 12`, raised to `MAX_DEPENDENCY_EDGES = 14` for dependency diagrams.
* `MAX_ARCHITECTURE_GROUPS = 3`.
* `MAX_FOCAL_NODES = 2`, counting nodes whose `role` is `focal`.
* `MAX_SEQUENCE_FRAGMENTS = 2`, plus a rule that two fragments must both be `opt` or `loop` and may not include an `alt`.

`validateTypeSpecificData` in the same file carries three more caps that read as complexity budgets rather than schema rules: a flowchart `decision` node may have at most three outgoing edges, a dependency diagram may hold at most one `cycle` edge, and a state-preset flow diagram may hold at most twice as many edges as nodes.

`app/src/services/diagrams/diagram_layout.ts` adds a ninth cap, `MAX_DEPENDENCY_RANKS = 4`, thrown from `layoutLayeredNodes` when a dependency graph ranks deeper than four layers.

Each of these throws `Malformed diagram data: ...`. Because `diagram_view_service.ts` calls `layout(parseDiagramData(file.content))` in a single expression when loading a diagram file, any one violation is caught as `currentDiagramError` and the entire diagram renders as an error message. There is no partial render.

### Where the limits came from

Not from the design specification. [F\_267\_render\_diagrams\_from\_data.md](design/feature_descriptions/F_267_render_diagrams_from_data.md) instructs that the diagram-design skill be read once as a **design source** for "box anatomy, connector semantics, complexity budget, and anti-patterns". That skill states its complexity budgets as authoring advice in prose. The implementation converted that advice into hard validation errors. F_267 never asked for enforcement, and no other card does either.

### The technical pressure that is real

The caps were not arbitrary. They mask four genuine weaknesses in `diagram_layout.ts`, all of which surface as thrown errors or as slowness once diagrams grow:

* `bestRoute` throws `no unobstructed route exists for edge <id>` or `no non-overlapping route exists for edge <id>` when none of its candidate lanes clears every other node and every previously routed edge. Routing is greedy and sequential: each edge is routed against the edges already placed, and earlier edges are never reconsidered. The chance that some late edge has no clean lane rises steeply with edge count, so the edge caps were what kept this failure rare.
* `portPoint` throws `node <id> is too small for distinct connector ports` when a node's connector count exceeds its side length divided by the 8px `PORT_GAP`. A 160px-wide default node supports about nineteen ports on that side, but a 24px flow terminator supports two. High fan-in is exactly what the edge caps prevented.
* `MAX_DEPENDENCY_RANKS` guards nothing but layout aesthetics. A deep dependency graph is legitimate data.
* `graphComponents` computes transitive closure by running as many passes as there are nodes, and inside each pass it walks every node, every destination reached so far, and every node reachable from that destination. That is roughly O(n^4) in node count. At nine nodes the cost is invisible; at a few hundred nodes it blocks the main thread.

So the honest answer to this card's first question is: yes, there is a technical reason, but it is a layout-robustness reason, not a data-validity reason. Rejecting the user's data was the wrong place to solve it.

### Aggravating detail

`DEFAULT_DIAGRAM_FOOTER` in `app/src/data/data_types.ts` describes the JSON contract to the diagram agent and never mentions any of these caps. The agent therefore has no way to stay inside them. It emits a twelve-node architecture diagram, the parser rejects the file, and the run's entire output is lost behind a message the user cannot act on.

## Implementation details

Two changes: the parser stops judging size, and the layout stops throwing.

### 1. Strip every complexity cap from `diagram_data.ts`

* Delete the eight constants `MAX_NODES`, `MAX_EDGES`, `MAX_DEPENDENCY_EDGES`, `MAX_ENTITY_NODES`, `MAX_SEQUENCE_NODES`, `MAX_FOCAL_NODES`, `MAX_ARCHITECTURE_GROUPS`, and `MAX_SEQUENCE_FRAGMENTS`.
* Delete `validateComplexity` entirely, along with its call at the end of `validateTypeSpecificData`.
* In `validateSequenceFragments`, keep only the rules that protect structure: fragments are allowed on sequence diagrams only, an `alt` fragment needs exactly two regions while `opt` and `loop` need one, and an edge may not appear twice within one fragment. Drop the two-fragment count cap and the "two fragments must both use opt or loop" rule.
* In `validateTypeSpecificData`, drop the three remaining budgets: the three-exit ceiling on flowchart `decision` nodes, the single-`cycle` ceiling on dependency diagrams, and the `edges.length > nodes.length * 2` ceiling on state-preset flow diagrams. Keep the two rules beside them that are about meaning rather than size: a decision branch still requires a label, and a state transition still requires a label.

What the parser keeps is everything that makes a document interpretable: schema shape, version, enum membership, the 4px grid on geometry, orthogonal waypoints, unique node and edge identifiers, and references that resolve. A document is now rejected only when it cannot be understood, never when it is merely large.

### 2. Make `diagram_layout.ts` degrade instead of throw

* Remove `MAX_DEPENDENCY_RANKS` and the throw in `layoutLayeredNodes`. Deep dependency graphs lay out across as many ranks as they need.
* `bestRoute` already sorts candidate routes by `routePenalty`, which weights obstacle crossings at 100000, edge overlaps at 10000, and path length at 1. Keep that ranking and delete both throws that follow it. The lowest-penalty candidate is returned even when it crosses a node or shares a segment with an earlier edge. A cluttered diagram is strictly better than no diagram.
* `routePenalty` scans all nodes and all previously routed edges per candidate, and `bestRoute` calls it from inside a sort comparator, so each candidate is scored many times over. Score each candidate once into an array, then take the minimum. This is a straight rewrite of `bestRoute`, and at large edge counts it is the difference between seconds and milliseconds.
* `portPoint` stops throwing when a node is too narrow for distinct ports. When the computed spacing would fall below `PORT_GAP`, clamp: distribute the ports across the side anyway and let them coincide. Connectors sharing an attach point on a small node is the correct visual outcome; an error is not.
* Replace the repeated-pass closure in `graphComponents` with an iterative strongly-connected-components pass (Tarjan or Kosaraju, iterative so deep graphs cannot overflow the stack). The observable output is unchanged: a component index per node plus a component count. Only the cost changes, from roughly O(n^4) to linear in nodes plus edges. `graphRanks`, which ranks components by longest path over the condensed graph, keeps working against that same output.

Nothing in the rendering components changes. They already draw whatever positioned data they are handed.

### 3. Leave the agent footer alone

`DEFAULT_DIAGRAM_FOOTER` needs no edit. It never mentioned the caps, so removing them does not contradict it.

### 4. Tests

* `app/src/services/diagrams/diagram_data.node.test.ts` asserts `'nodes has more than 9 items'` in the test named "rejects invalid type semantics, geometry, and complexity". Remove that assertion and its ten-node fixture, and rename the test to drop "complexity"; the remaining assertions cover type semantics and geometry.
* Add a parser test proving a large document parses: at least 40 nodes and 60 edges, more than three focal nodes, more than three architecture groups, and three sequence fragments including an `alt`.
* Add a layout test proving a dense graph lays out without throwing, where at least one edge is necessarily obstructed or overlapping, asserting that every input edge appears in the positioned output.
* Add a layout test for a narrow node, such as a 24px state terminator, with more incoming edges than `PORT_GAP` allows, asserting that it positions rather than throws.
* Add a layout test for a dependency graph deeper than four ranks.

Check types with `npm run typecheck` and run the vitest suites. Do not use `npm run build` for type checking.

## Acceptance criteria

* A diagram document with any number of nodes, edges, and groups parses and renders. No upper bound remains in `diagram_data.ts` on nodes, edges, groups, focal nodes, or sequence fragments, and none remains in `diagram_layout.ts` on dependency ranks.
* The constants `MAX_NODES`, `MAX_EDGES`, `MAX_DEPENDENCY_EDGES`, `MAX_ENTITY_NODES`, `MAX_SEQUENCE_NODES`, `MAX_FOCAL_NODES`, `MAX_ARCHITECTURE_GROUPS`, `MAX_SEQUENCE_FRAGMENTS`, and `MAX_DEPENDENCY_RANKS` no longer exist anywhere in the codebase.
* An architecture diagram with three or more `focal` nodes and four or more groups renders normally.
* A sequence diagram with three or more fragments, including an `alt` alongside an `opt`, renders normally.
* A dependency diagram with several `cycle` edges and a rank depth above four renders normally.
* A flowchart `decision` node with four or more labelled outgoing branches renders normally.
* A state diagram whose edge count exceeds twice its node count renders normally.
* `layout` never throws for a document that `parseDiagramData` accepted. Edges that cannot be routed cleanly are drawn along their lowest-penalty route, crossing nodes or overlapping other edges as needed, and every input edge is present in the positioned output.
* A node too narrow to hold distinct connector ports lays out with ports clamped onto shared positions instead of raising `too small for distinct connector ports`.
* Genuinely malformed documents are still rejected with the same precise messages: unknown enum values, duplicate identifiers across nodes and edges, edges pointing at unknown nodes, geometry off the 4px grid, diagonal waypoints, missing decision-branch labels, and missing state-transition labels.
* A 100-node, 150-edge diagram lays out in well under a second on the main thread, with `graphComponents` no longer the bottleneck.
* `npm run typecheck` passes and the full vitest suite passes.
