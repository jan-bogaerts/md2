---
author:
id: F_273
internalId: cd29dd64-c875-44fb-b4c4-e131a4a113c8
title: define editable diagram contract
status: ready
owner:
affects:
agents:
  - design/activity/card__cd29dd64-c875-44fb-b4c4-e131a4a113c8.json
policy:
changedFiles:
  - design/architecture/editable_diagram_contract.md
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

Contract document: [editable diagram contract](../architecture/editable_diagram_contract.md).

## Goal

Pin down the editable JSON contract before interaction code is added. `DiagramData` remains canonical; `PositionedDiagramData` remains derived.

## Scope

* Define editable identities for nodes, edges, groups, fragments, metadata, and legend entries.
* Define original diagram, editable copy, saved copy, dirty state, and change-set terminology.
* State which geometry is persisted and which geometry is derived.
* Keep repository paths as persistence locations, never diagram or object identity.
* Document that the original diagram and its record are immutable.

## Current state

There is no editable diagram model and no document describing one. `design/architecture/` contains no diagram document at all, so every later job in F\_255 would otherwise invent its own terminology.

`shared/diagram_data.mjs` with its `shared/diagram_data.d.mts` sidecar is the only diagram contract that exists. `parseDiagramData` reads JSON and returns `DiagramData` with `meta`, `nodes`, `edges`, `groups`, and optional `fragments`. Every failure throws `Malformed diagram data: <field> has <reason>`, naming the exact field path. There is no writer: the module can parse a diagram but cannot serialize one, and `serializeDiagramIndex` in `app/src/services/diagrams/diagram_index.ts` covers only the index file.

Identity today is unevenly defined. Node identifiers and edge identifiers share one namespace, and `validateReferences` rejects an identifier used by both a node and an edge. Group identifiers and fragment identifiers are unique within their own arrays. Group membership references node identifiers, and each sequence fragment region references edge identifiers. Legend entries in `meta.legend` carry only `label` and `role`, so their only identity is their array position. Entity fields inside `DiagramNode.fields` are likewise identified by position.

Geometry today is optional and partly derived. `DiagramNode.x`, `y`, `width`, and `height` are optional and, when present, must be finite multiples of four, because `requireGridNumber` rejects anything off that four-pixel grid. `DiagramEdge.waypoints` are optional, need at least two points, and must be orthogonal, because `parseWaypoints` rejects any segment where both coordinates change. Groups, sequence fragments, and activations have no persisted geometry of any kind.

`layout` in `app/src/services/diagrams/diagram_layout.ts` fills in everything the JSON leaves out and produces `PositionedDiagramData`. It supplies default node sizes per diagram type and node kind, snaps computed positions to the same four-pixel grid, computes `fanIn` per node, routes edge `points`, places edge labels, computes group boxes from the extents of their member nodes, computes sequence activations and fragment boxes, and computes the surface `width` and `height`. Because `PositionedDiagramNode extends DiagramNode` and `PositionedDiagramEdge extends DiagramEdge`, a derived coordinate and a persisted coordinate are indistinguishable by shape once layout has run. That is the main hazard for editing: writing a positioned object back to JSON would silently promote derived geometry into persisted geometry for every object in the diagram.

`DiagramViewService` in `app/src/services/diagrams/diagram_view_service.ts` loads a diagram through `loadTextFile`, then `parseDiagramData`, then `layout`, and keeps only the positioned result in `snapshot.currentDiagram`. The parsed `DiagramData` is discarded, so no original model data survives loading. The service publishes one whole-snapshot `changed` event rather than granular events.

Diagram identity outside the JSON lives in `app/src/services/diagrams/diagram_index.ts`. A `DiagramRecord` holds a generated `id`, the producing `actionId`, `createdAt`, a `label`, an optional `parent` reference of `diagramId`, `itemId`, and `itemLabel`, and a `path`. The record `id` is the identity; `path` is only a location, and `validateDiagramPaths` requires it to sit inside the configured diagrams folder and to end in `.json`. Drill-down children are filed under the parent diagram's node or edge identifier as `itemId`.

Nothing in the codebase expresses an editable copy, a dirty state, a change set, or a save-as-copy operation.

Two conflicts must be resolved by the contract rather than by a later job:

* F\_271 plans to delete `DiagramMeta.legend`, `DiagramLegendItem`, and `parseLegend`, deriving the legend from the roles and kinds actually used. F\_271 is not implemented yet, so `meta.legend` still parses today. F\_255 nevertheless lists the legend as an editable object in the toolbox `Others` section, and F\_321 edits it.
* F\_255 decides that groups are independently positioned and sized, but group geometry is currently derived from member nodes and is not persisted anywhere.

## Implementation details

This job writes one document, `design/architecture/editable_diagram_contract.md`, and changes no code. Schema changes, types, services, and tests belong to the jobs that follow, and each of them cites this document instead of restating it. The document is added to `design/architecture/` beside `current_data_model.md` and carries an `internalId` in its front matter like the other architecture documents.

The document defines the vocabulary first, because every later job reuses it.

**Original diagram** means the `DiagramData` parsed from the file at `DiagramRecord.path`, together with that record. Both are immutable for the whole edit flow. **Editable diagram** means one deep in-memory copy of that `DiagramData`, owned by the edit session from F\_275, and it is model data, never positioned data. **Derived layout** means the `PositionedDiagramData` produced by `layout` from the editable diagram; it is recomputed, never edited, and never saved. **Dirty** means the editable diagram differs by value from the original diagram; it is not a per-object flag, and it is not set by selection, tool changes, or zoom. **Change set** means the ordered record of applied mutations that F\_277 tracks and F\_322 turns into text. **Saved copy** means the new JSON file plus the new `DiagramRecord` created by the first save; every later save of the same session overwrites that file and updates that record only.

The document then pins identity per object type, because the toolbox can select and delete each of them. Node and edge identifiers stay one shared namespace of opaque non-empty strings, as `validateReferences` already enforces, so a single selection identifier can address either. Group and fragment identifiers stay unique within their own collections. Newly created objects receive generated identifiers that are never derived from labels, so renaming an object never changes its identity and never orphans a group membership, a fragment region, or a drill-down child record. Identifiers of objects that already exist are never rewritten by an edit, including on copy and paste inside the same diagram, where the pasted objects are new objects with new identifiers. Diagram metadata is a singleton with no identifier and is addressed as the diagram itself.

The two positional identities are named explicitly as such. Legend entries and entity fields are ordered content inside their owner, addressed by owner identifier plus index, and reordering them is a change to the owner rather than a change of identity. This is stated so F\_321 and F\_296 do not invent per-entry identifiers.

The legend conflict is resolved in favour of F\_271: the legend is derived from the roles and kinds present in the diagram and is not editable content, so the contract removes the legend from the editable object set and records that the F\_255 toolbox `Others` section holds diagram metadata and sequence fragments only. F\_321 becomes a documentation-only job under that resolution, and the contract says so rather than leaving F\_321 to discover it. This keeps one source of truth for legend content and avoids a second, hand-maintained copy that can drift from the diagram.

Geometry is split into persisted and derived, and the split is stated per object type. Persisted geometry is node `x`, `y`, `width`, and `height`, edge `waypoints`, and the connection-point data that F\_274 adds. Derived geometry is everything `layout` computes and nothing else: default node sizes, `fanIn`, edge `points`, edge label placement, sequence activations, fragment boxes, and surface `width` and `height`. Group geometry moves from derived to persisted, because F\_255 requires independently positioned and sized groups. The contract names the fields as group `x`, `y`, `width`, and `height`, with the same optionality and four-pixel grid rule as node geometry, and assigns the schema and layout change to F\_278, which is the job that makes layout compatible with editing. Until those fields are present, a group without them keeps today's derived box, so existing diagrams stay readable.

All persisted geometry keeps the existing four-pixel grid rule and the existing orthogonal-waypoint rule, so an edited diagram parses under the same validator as an authored one. The contract states the consequence directly: pointer coordinates are snapped before they reach the model, and the editable diagram is never populated from `PositionedDiagramData`, because that would persist derived defaults for every untouched object.

Validation boundaries are assigned to three layers, so F\_279 does not duplicate the parser. The first layer is `parseDiagramData`, which remains the only authority on what a valid diagram file is and stays the gate on both load and save. The second layer is operation validation, which decides whether a single edit is allowed before it is applied, using the diagram-type rules the parser already encodes, such as permitted edge kinds and node kinds per diagram type and preset, required decision-branch and state-transition labels, fragment region counts per operator, and the sequence-only nature of fragments. The third layer is save validation, which parses the serialized result once more and refuses to write a diagram the parser would reject. No layer relaxes a rule the parser enforces.

Copy and save behaviour is stated as a sequence, so F\_327 has no freedom to reinterpret it. Editing never writes to the original file or the original record. The first save serializes the editable diagram, writes it to a new path inside the configured diagrams folder, creates a new `DiagramRecord` with a new generated identifier that keeps the source record's `actionId` and `parent` reference, adds it to the index, and rebinds the session to that new record. Later saves in the same session write the same path and update the same record. The contract requires a canonical serializer that emits the parser's field set only, with two-space indentation and a trailing newline, matching `serializeDiagramIndex`, so a saved diagram produces a readable repository diff. Repository paths stay persistence locations throughout and never act as diagram or object identity, so moving a file changes only `DiagramRecord.path`.

Finally, the contract states what it forbids, because F\_255 already made this decision and the document is where later jobs will look for it. There is one diagram model, `DiagramData`. `PositionedDiagramData` stays derived rendering data. There is no second editable diagram type, no positioned-model hybrid, and no per-object editor state stored inside diagram data.

## Acceptance criteria

1. `design/architecture/editable_diagram_contract.md` exists, carries an `internalId` front matter field like the other documents in `design/architecture/`, and is referenced from F\_273.
2. The document defines original diagram, editable diagram, derived layout, dirty, change set, and saved copy, each in one place and each used consistently thereafter.
3. Identity is defined for nodes, edges, groups, sequence fragments, diagram metadata, entity fields, and legend content, and the document states which of those are identifier-addressed and which are position-addressed.
4. The document states that node and edge identifiers share one namespace, that generated identifiers are never derived from labels, and that existing identifiers are never rewritten by an edit.
5. Every geometry field is listed as either persisted or derived, with no field left unclassified, and group geometry is recorded as moving to persisted with the change assigned to F\_278.
6. The four-pixel grid rule and the orthogonal-waypoint rule are stated as binding on edited geometry, together with the rule that the editable diagram is never populated from `PositionedDiagramData`.
7. Validation is split across parser, operation, and save layers, each layer's responsibility is named, and no layer is permitted to relax a parser rule.
8. Copy-and-save behaviour is stated as an ordered sequence covering first save, later saves, record creation, index update, and canonical serialization, and it states that the original file and original record are never written.
9. The document states that repository paths are persistence locations only and never diagram or object identity.
10. The legend conflict with F\_271 is resolved explicitly, and the resulting toolbox `Others` content and the effect on F\_321 are recorded.
11. The contract covers all five diagram types in `DIAGRAM_TYPES` and every object the F\_255 toolbox exposes, without introducing a second diagram model.
12. Each remaining F\_255 job can be read against the contract and needs no representation decision that the contract leaves open.

## Out of scope

UI, mutations, persistence implementation, and agent handoff. This job changes no code and adds no schema fields; it only records what later jobs must implement.