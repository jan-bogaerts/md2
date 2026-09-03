---
internalId: eb6fb57e-6a7a-41ff-8010-a784d8998bcc
---

# Editable diagram contract

Written by [F_273](../feature_descriptions/F_273_define_editable_diagram_contract.md) for the jobs of
[F_255 make diagrams editable](../feature_descriptions/F_255_make_diagrams_editable.md). Every later F_255 job cites
this document instead of restating it. This document adds no schema field and changes no code; it records what the
implementing jobs must build.

The contract covers all five diagram types in `DIAGRAM_TYPES` (`architecture`, `dependency`, `sequence`, `flow`,
`entity`) and every object the F_255 toolbox exposes.

## 1. Vocabulary

These six terms are defined here once and are used with exactly this meaning everywhere else.

| Term | Definition |
|---|---|
| **Original diagram** | The `DiagramData` parsed by `parseDiagramData` from the file at `DiagramRecord.path`, together with that `DiagramRecord`. Both are immutable for the whole edit flow: no edit, no save, and no agent handoff ever writes either of them. |
| **Editable diagram** | One deep in-memory copy of that `DiagramData`, owned by the edit session of [F_275](../feature_descriptions/F_275_add_diagram_edit_session_service.md). It is model data (`DiagramData`), never positioned data. All mutations apply to it. |
| **Derived layout** | Stable service-owned positioned view objects. `layout` in `app/src/services/diagrams/diagram_layout.ts` may build their initial values when a diagram loads; an ordinary edit updates only geometry affected by that edit. Derived geometry is never written into the editable diagram and is never saved. |
| **Dirty** | The session's semantic change registry contains at least one entry. A mutation updates only its affected entry and never compares complete diagrams. Selection, active tool, zoom, pan, and scroll never make a session dirty, because none of them changes `DiagramData`. |
| **Change set** | The ordered record of applied mutations that [F_277](../feature_descriptions/F_277_track_diagram_changes.md) tracks and [F_322](../feature_descriptions/F_322_generate_diagram_change_descriptions.md) turns into text. It describes model changes only. |
| **Saved copy** | The new JSON file plus the new `DiagramRecord` created by the first save of a session. Every later save of the same session overwrites that file and updates that record only. |

## 2. Object identity

The toolbox can select and delete each object type, so each one needs a stated addressing rule. Two kinds exist:
**identifier-addressed** objects carry their own identifier in the JSON, and **position-addressed** content has no
identifier and is addressed as owner plus index.

| Object | Addressing | Rule |
|---|---|---|
| Node | Identifier-addressed | `DiagramNode.id`, an opaque non-empty string. |
| Edge | Identifier-addressed | `DiagramEdge.id`, an opaque non-empty string, in the **same namespace as node identifiers**. |
| Group | Identifier-addressed | `DiagramGroup.id`, unique within `groups` only. |
| Sequence fragment | Identifier-addressed | `DiagramSequenceFragment.id`, unique within `fragments` only. Fragments exist on sequence diagrams only. |
| Diagram metadata | Singleton, no identifier | `meta` is addressed as the diagram itself. |
| Entity field | Position-addressed | Owner node identifier plus index into `DiagramNode.fields`. |
| Legend content | Not editable content | Derived from the diagram; see [section 6](#6-legend-resolution-of-the-f_271-conflict). |

Consequences that later jobs must respect:

* **One shared node and edge namespace.** `validateReferences` in `shared/diagram_data.mjs` already rejects a diagram
  in which one identifier is used by both a node and an edge, so a single selection identifier can address either
  object. Selection, delete, cut, copy, and the drill-down child record all rely on that.
* **Generated identifiers are never derived from labels.** A newly created node, edge, group, or fragment receives a
  generated identifier that carries no label text. Renaming an object therefore never changes its identity and never
  orphans a group membership, a fragment region, or a drill-down child `DiagramRecord`.
* **Existing identifiers are never rewritten by an edit.** This includes copy and paste inside the same diagram: the
  pasted objects are new objects with new generated identifiers, and the originals keep theirs. Nothing in the edit
  flow renumbers, compacts, or normalises identifiers.
* **Position-addressed content reorders as an owner change.** Reordering entity fields is a change to the owning node,
  not a change of identity, so [F_296](../feature_descriptions/F_296_edit_diagram_object_details.md) must not invent
  per-field identifiers.

### State publication

The edit session may deep-clone the source diagram once when a session starts and may traverse or serialize the
complete editable diagram at an explicit persistence, validation, agent-output, or final-output boundary. Ordinary
edits assign only the requested field on the existing service-owned object. They do not use object spread, `map`,
`structuredClone`, array replacement, or complete-diagram comparison to publish an update.

Each editable field has an `EventTarget` event scoped by object kind, stable object identifier, and field. Entity
fields use node identifier plus field index; connection points use edge identifier plus endpoint. Collection
membership has a separate event for each object kind. Stable ordered identifier-list snapshots change reference only
when that collection gains, loses, or reorders an object.

React leaves subscribe with `useSyncExternalStore` to the smallest primitive or stable reference they render.
Collection hosts subscribe only to ordered identifier lists. Diagram roots, comparison roots, pane layouts, and
toolbox roots never subscribe to a complete `DiagramData`, `PositionedDiagramData`, or catch-all diagram event.

## 3. Geometry: persisted versus derived

Every geometry field is classified below; nothing is left unclassified. Persisted geometry lives in `DiagramData` and
is written to the saved copy. Derived geometry is computed by `layout` into `PositionedDiagramData` and is never
written.

### Persisted geometry

| Field | Owner | Notes |
|---|---|---|
| `x`, `y` | `DiagramNode` | Optional; finite multiple of four. |
| `width`, `height` | `DiagramNode` | Optional; positive finite multiple of four. |
| `waypoints[].x`, `waypoints[].y` | `DiagramEdge` | Optional; at least two points; every segment orthogonal. |
| Connection-point data | `DiagramEdge` source and target | Added by [F_274](../feature_descriptions/F_274_add_editable_connection_points.md) as node side plus relative offset. Persisted from the day F_274 adds it. |
| `x`, `y`, `width`, `height` | `DiagramGroup` | **Moves from derived to persisted**, because F_255 requires independently positioned and sized groups. Schema and layout change assigned to [F_278](../feature_descriptions/F_278_make_diagram_layout_compatible_with_editing.md). Same optionality and same four-pixel grid rule as node geometry. Until a group carries these fields, it keeps today's box computed from member-node extents, so existing diagrams stay readable. |

### Derived geometry

Everything `layout` computes, and nothing else:

| Field | Owner | Source |
|---|---|---|
| `x`, `y` when the node omits them | `PositionedDiagramNode` | Rank and column placement, snapped to the four-pixel grid. |
| `width`, `height` when the node omits them | `PositionedDiagramNode` | Default sizes per diagram type and node kind, including entity height computed from field count. |
| `fanIn` | `PositionedDiagramNode` | Incoming-edge count. |
| `points` | `PositionedDiagramEdge` | Routed path, seeded by `waypoints` when they are present. |
| `labelPlacement` | `PositionedDiagramEdge` | Edge label box and text position. |
| `x`, `y`, `width`, `height` | `PositionedSequenceActivation` | Sequence activation bars. |
| `x`, `y`, `width`, `height`, `dividerY`, `guardPositions` | `PositionedSequenceFragment` | Sequence fragment boxes and guard placement. |
| `x`, `y`, `width`, `height` when the group omits them | `PositionedDiagramGroup` | Member-node extents plus padding. |
| `width`, `height` | `PositionedDiagramData` | Surface size. |

### Rules binding on edited geometry

* **Four-pixel grid.** Every persisted coordinate and size stays a finite multiple of four, because
  `requireGridNumber` in `shared/diagram_data.mjs` rejects anything else. Pointer coordinates are snapped to the grid
  *before* they reach the editable diagram, not at save time.
* **Orthogonal waypoints.** Every waypoint segment changes one coordinate only, because `parseWaypoints` rejects a
  segment in which both coordinates change.
* **The editable diagram is never populated from `PositionedDiagramData`.** Because `PositionedDiagramNode extends
  DiagramNode` and `PositionedDiagramEdge extends DiagramEdge`, a derived coordinate and a persisted coordinate are
  indistinguishable by shape once layout has run. Writing a positioned object back into the model would silently
  promote layout defaults into persisted geometry for every untouched object in the diagram. A mutation therefore
  writes only the fields the user actually changed, onto the editable model object.

Because the same grid and orthogonality rules apply, an edited diagram parses under exactly the same validator as an
authored one.

## 4. Validation layers

Validation is split across three layers. No layer is permitted to relax a rule the parser enforces.

1. **Parser validation — `parseDiagramData` in `shared/diagram_data.mjs`.** The single authority on what a valid
   diagram file is. It runs on load and again on save. Its errors keep the `Malformed diagram data: <field> has
   <reason>` form that names the exact field path.
2. **Operation validation — [F_279](../feature_descriptions/F_279_validate_diagram_edit_operations.md).** Decides
   whether one edit is allowed *before* it is applied, so the editable diagram never enters an invalid state. It
   reuses the diagram-type rules the parser already encodes: permitted edge kinds per diagram type, permitted node
   kinds per diagram type and flow preset, required decision-branch labels on the `flowchart` preset, required
   transition labels on the `state` preset, entity-only `fields` and cardinalities, fragment region counts per
   operator (`alt` needs two, `opt` and `loop` need one), no duplicate edge references across a fragment's regions,
   and fragments on sequence diagrams only.
3. **Save validation — [F_327](../feature_descriptions/F_327_save_edited_diagram_as_copy.md).** Parses the serialized
   result once more and refuses to write a diagram the parser would reject. This is the last gate before the file
   system.

Layer 2 exists so an invalid edit is refused with useful context, not so the parser can be bypassed. If layers 2 and 1
ever disagree, layer 1 wins and the operation is a defect.

## 5. Copy and save behaviour

Editing never writes the original file or the original `DiagramRecord`. Saving proceeds in this order.

**First save of a session**

1. Serialize the editable diagram with the canonical serializer described below.
2. Validate the serialized text with `parseDiagramData`; abort the save on failure without touching the file system.
3. Write the text to a **new** path inside the configured diagrams folder. The `isPathInsideDiagramsFolder` rule and
   the `.json` suffix rule that `validateDiagramPaths` enforces both still apply.
4. Create a new `DiagramRecord` with a newly generated `id`, keeping the source record's `actionId` and its `parent`
   reference, and pointing `path` at the new file.
5. Add that record to the diagram index and write the index with `serializeDiagramIndex`.
6. Rebind the edit session to the new record. The session is no longer dirty.

**Later saves in the same session**

Write the same path and update the same record. No new file and no new record are created, and the index gains no
further entry.

**Canonical serializer**

The serializer emits the parser's field set only — no derived geometry, no editor state, no unknown keys — with
two-space indentation and a trailing newline, matching `serializeDiagramIndex` in
`app/src/services/diagrams/diagram_index.ts`. Field order is stable across saves, so a saved diagram produces a
readable repository diff.

## 6. Legend: resolution of the F_271 conflict

[F_271](../feature_descriptions/F_271_diagrams_add_legend.md) plans to delete `DiagramMeta.legend`,
`DiagramLegendItem`, and `parseLegend`, deriving legend content from the roles and kinds actually present in the
diagram. F_255 listed the legend as an editable object in the toolbox `Others` section. **The conflict is resolved in
favour of F_271.**

* The legend is derived content, not editable content, so it is removed from the editable object set of F_255.
* The toolbox `Others` section therefore holds **diagram metadata and sequence fragments only**.
* [F_321 edit diagram legend](../feature_descriptions/F_321_edit_diagram_legend.md) becomes a documentation-only job
  under this resolution: it records that legend content follows the diagram and offers no legend editor.
* `meta.legend` still parses today, because F_271 is not implemented yet. Until F_271 lands, an existing `meta.legend`
  is carried through the editable diagram and the canonical serializer unchanged, and is never presented as editable.

The reason is one source of truth: a hand-maintained legend can drift from the roles and kinds the diagram actually
uses, and a second editable copy would make that drift invisible.

## 7. Paths are locations, not identity

Diagram identity is `DiagramRecord.id`. Object identity is the object identifier inside the JSON. A repository path is
a persistence location and nothing more, in the diagram record and in the file system alike. Moving a diagram file
changes `DiagramRecord.path` and nothing else: no diagram identifier, no node or edge identifier, no group membership,
no fragment region, and no drill-down child reference changes with it. Nothing in the edit flow may key edit state by
path.

## 8. What this contract forbids

* There is **one** diagram model: `DiagramData`. No second editable diagram type is introduced.
* `PositionedDiagramData` stays derived rendering data. It never becomes a source of truth and is never serialized.
* No positioned-model hybrid: no type that mixes persisted and derived geometry into the saved shape.
* No per-object editor state inside diagram data. Selection, hover, active tool, dirty marks, and undo bookkeeping
  live in the edit session, never in `DiagramData`.
