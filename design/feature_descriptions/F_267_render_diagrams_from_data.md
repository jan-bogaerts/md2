---
author: 
id: F_267
internalId: d7ab38b3-a791-4448-9b4d-65ce56961971
title: render diagrams from data instead of generated svg
status: ready
owner: 
affects:
agents:
  - design/activity/card__d7ab38b3-a791-4448-9b4d-65ce56961971.json
policy:
branch: f_267_render_diagrams_from_data_instead_of_generated_svg
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/diagram_view/architecture_diagram.tsx
  - app/src/components/diagram_view/dependency_diagram.tsx
  - app/src/components/diagram_view/diagram.tsx
  - app/src/components/diagram_view/diagram_edge.tsx
  - app/src/components/diagram_view/diagram_group.tsx
  - app/src/components/diagram_view/diagram_legend.tsx
  - app/src/components/diagram_view/diagram_node.tsx
  - app/src/components/diagram_view/diagram_path.node.test.ts
  - app/src/components/diagram_view/diagram_path.ts
  - app/src/components/diagram_view/diagram_renderer.test.tsx
  - app/src/components/diagram_view/diagram_renderer.tsx
  - app/src/components/diagram_view/diagram_role_style.ts
  - app/src/components/diagram_view/diagram_selection.ts
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/diagram_view/entity_diagram.tsx
  - app/src/components/diagram_view/flow_diagram.tsx
  - app/src/components/diagram_view/sequence_activation.tsx
  - app/src/components/diagram_view/sequence_diagram.tsx
  - app/src/components/diagram_view/sequence_fragment.tsx
  - app/src/components/shell/project/project_folder_setup_fields.tsx
  - app/src/data/action_placeholders.ts
  - app/src/data/data_types.ts
  - app/src/services/actions/action_prompt_draft_service.node.test.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_text.node.test.ts
  - app/src/services/config/config_entries.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/diagrams/diagram_data.node.test.ts
  - app/src/services/diagrams/diagram_data.ts
  - app/src/services/diagrams/diagram_index.node.test.ts
  - app/src/services/diagrams/diagram_layout.node.test.ts
  - app/src/services/diagrams/diagram_layout.ts
  - app/src/services/diagrams/diagram_svg_sanitizer.test.ts
  - app/src/services/diagrams/diagram_svg_sanitizer.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - desktop/src/actions/action/action_diagram_output.js
  - desktop/src/actions/action/action_diagram_output.test.mjs
  - desktop/src/actions/action/action_run_request.test.mjs
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/action/action_text.test.mjs
---
Follow-up on [F\_262\_add\_diagram\_view.md](design/feature_descriptions/F_262_add_diagram_view.md), which is implemented.

Today the diagram agent generates a complete standalone SVG and MD² sanitizes it and injects it into the DOM. Replace that: the agent produces **JSON data** describing shapes and connections, and MD² owns rendering through React components.

* Diagram actions return a JSON file, not an SVG file.
* MD² renders the diagram with React components. Nodes are rendered by node components and connections by edge components.
* Support a fixed set of five diagram types instead of the skill's full catalogue.
* Data may carry position and size per item. When absent, MD² computes the layout itself with a simple algorithm.

## Why

* **Sanitizing disappears.** React builds the diagram from typed props. There is no agent-authored markup, so no parser, no attribute allowlist, and no injection surface. `diagram_svg_sanitizer.ts` and its tests are removed.
* **Interaction is a prop, not a convention.** Today the default diagram footer asks the agent to remember `data-diagram-id`, `data-diagram-label`, `tabindex`, and `role` on every drill-down item, and the app hopes it complied. With components, click handling, keyboard focus, and the accessible name are guaranteed by construction.
* **Correct geometry by construction.** The skill's connector rules (orthogonal routing, no overlapping connectors, fanned attach points on a shared edge, label-to-connector margin) become invariants of the renderer rather than instructions an agent may ignore.
* **Validation gets cheap.** A JSON schema replaces inspecting generated geometry. Malformed output is rejected with a precise message.
* **Cheaper, more reliable runs.** Emitting a few dozen lines of JSON is far more reliable than emitting hundreds of lines of absolute-coordinate SVG.
* **Theming for free.** Colors come from MD²'s theme rather than hex literals baked into agent output.

## Diagram types

Support exactly these five. The wider list in [F\_228\_add\_support\_for\_diagrams.md](design/feature_descriptions/F_228_add_support_for_diagrams.md) stays out of scope, as do all generic chart types.

| Type           | Shows                                                                             | Layout family      |
| -------------- | --------------------------------------------------------------------------------- | ------------------ |
| `architecture` | components, services, stores, external systems, connections                       | layered graph      |
| `dependency`   | module, package, and build dependencies, fan-in, cycles                           | layered graph      |
| `sequence`     | time-ordered calls, events, async interaction                                     | deterministic grid |
| `flow`         | branching logic and state lifecycles (flowchart and state machine as two presets) | layered graph      |
| `entity`       | entities, fields, relationships (entity level, not physical columns)              | layered graph      |

Three layout families cover all five, and one of them needs no graph algorithm at all.

## Diagram data

One JSON document per diagram, versioned, replacing the stored SVG file. Rough shape, to be pinned down during grooming:

* `meta` — schema version, diagram `type`, title, description, optional legend.
* `nodes[]` — `id`, `label`, optional `sublabel`, optional `tag`, `role`, optional `drilldown`, optional `x` / `y` / `width` / `height`.
* `edges[]` — `from`, `to`, `kind`, optional `label`, optional waypoints.
* `groups[]` — containment or zone boxes with a label, wrapping a set of node ids.

`role` carries the skill's semantic roles (focal, backend, store, external, input, optional, boundary) so styling stays a lookup rather than agent-chosen color.

Every node is a potential drill-down item, so `id` and `label` replace the `data-diagram-id` and `data-diagram-label` attributes that the sanitizer preserved. Edges are selectable too, matching F\_262's existing behaviour.

## Rendering components

Build the components from the diagram-design skill definition, which stays a **design source read once**, never a runtime dependency and never vendored. Its `references/type-*.md` files specify each type's box anatomy, connector semantics, complexity budget, and anti-patterns in prose; `references/style-guide.md` holds the tokens; `assets/example-*.html` are the visual targets to match. Note that most type references carry no SVG at all, so the components are written from the written spec and checked against the examples by eye.

The renderer is component-based, not SVG-based. Its core components are:

* `Diagram` — owns the diagram surface and renders the positioned data.
* `Node` — renders a node from its type, role, content, position, and size. Type-specific node components may implement distinct structures such as an entity with fields or a sequence participant.
* `Edge` — renders a connection from its kind, endpoints, route, label, and interaction data. Type-specific edge components may implement semantics such as dependency direction, sequence messages, state transitions, or entity cardinality.
* `Group` — renders optional containment or zone information.
* `Legend` — renders optional diagram legend data.

Each of the five diagram types gets a thin React component that maps its validated data onto these shared components. Nodes and edges own their pointer, keyboard, tooltip, and accessible-name behaviour directly through React handlers and props.

Typography and palette map onto MD²'s existing MUI theme rather than the skill's fonts, so diagrams match the rest of the app in both light and dark mode.

## Layout

Positions and sizes are **optional** in the data. The layout pass fills in only what is missing, so a fully positioned diagram is rendered verbatim and a bare semantic one is laid out automatically. Both must work, and mixtures of the two must work.

Write the algorithms ourselves, with one allowed dependency. No `elkjs` — it is a compiled Java port, around a megabyte, and out of proportion for five diagram types. `dagre` **may** be used for node ranking and placement in the graph family; it is small, pure JavaScript, and saves the ranking and crossing-reduction work. Orthogonal edge routing is ours either way, since dagre produces polylines rather than the rounded right-angle connectors the skill mandates.

* **Layered graph** — rank nodes and order within a rank to reduce crossings, either by hand (longest-path ranking) or through dagre, then space on the 4px grid. Route edges ourselves as orthogonal paths with rounded elbows, fanning attach points along a shared edge.
* **Deterministic grid** — sequence needs no graph algorithm. Participants are columns, messages are rows; positions are arithmetic.

Keep layout behind a single `layout(data) => positioned` interface so an algorithm can be swapped or upgraded without touching the components.

## Removal of SVG diagram support

SVG is not a supported diagram format after this card. There is no dual-format period, no fallback, and no migration. Every code path that reads, writes, sanitizes, or describes an SVG diagram goes away, and diagram records written before this card are discarded on load rather than converted.

Delete outright:

* `app/src/services/diagrams/diagram_svg_sanitizer.ts` and `diagram_svg_sanitizer.test.ts`. Its only caller is `diagram_view_service.ts`.
* `desktop/src/actions/action/action_diagram_output.js` builds a `<label>-<timestamp>.svg` filename and rejects any returned `diagramPath` whose extension is not `.svg`. Both become `.json`.

Strip the SVG assumptions from what survives:

* `diagram_view_service.ts` — `currentSvg` and `currentSvgError` in the snapshot, `decodeSvgAsset` and its `image/svg+xml` content-type check, `loadSanitizedSvg`, and `loadActiveSvg`. Replaced by loading and schema-parsing the JSON document; rename the snapshot fields to match.
* `diagram_view.tsx` — the sanitized-markup injection, `handleSvgClick`, and `interactiveDiagramElement`, which locates a target by `closest('[data-diagram-id][data-diagram-label]')`. Replaced by rendering the typed diagram and handling clicks on the node and edge components directly.
* `DEFAULT_DIAGRAM_FOOTER` in `app/src/data/data_types.ts` — currently instructs the agent to produce standalone SVG, mark items with `data-diagram-id` / `data-diagram-label` / `tabindex` / `role`, and avoid scripts, `foreignObject`, links, and external resources. All of that is meaningless once the agent emits data. Rewritten to describe the JSON contract, the five supported types, and the field vocabulary.
* `app/src/data/action_placeholders.ts` — the `diagram-file` description reads “Absolute path where the current diagram action must save its SVG output.” The placeholder stays; the wording changes.
* Any test asserting on sanitizing, SVG parsing, `.svg` paths, or the old footer wording.

Leave alone: SVG support unrelated to diagrams, such as card images in `asset_paths.ts`, `card_image_operations.ts`, and the desktop MIME tables. Those serve other features.

The `diagramPath` plumbing through `action_run_registry.ts`, `action_run_types.ts`, `action_prompt_draft_service.ts`, `electron_action_bridge.ts`, and `action_popup_operations.ts` is format-agnostic and stays as is.

## Current state

F\_262 is implemented and this card replaces part of it:

* `app/src/services/diagrams/diagram_index.ts` stores a `DiagramRecord` per diagram with a repository-relative `path`. The record shape survives; the file it points at becomes JSON instead of SVG.
* `app/src/services/diagrams/diagram_view_service.ts` owns records, active path, popup state, and persistence. Structure is largely unchanged; the load-and-validate step swaps sanitizing for schema parsing.
* `app/src/components/diagram_view/diagram_view.tsx` owns the breadcrumb, Back button, FAB, context menu, and the diagram viewport. Everything except the viewport stays.
* `{{diagram-file}}` continues to resolve to the generated file path; only the expected format and extension change.

See the removal section above for what each of these loses.

Breadcrumb navigation, drill-down through `{{parent-node}}`, root and child action types, the diagram FAB, and the index tree all stay as they are.

## Out of scope

* User repositioning and resizing of diagram items. Planned for the next iteration, which is why position and size live in the data from the start and why the renderer must honour them when present. Persisting user edits back into the JSON is that card's problem, not this one.
* Any diagram type beyond the five listed.
