---
author: 
id: F_451
internalId: c814173c-590e-47c3-b5cf-b7bcc7ae356e
title: diagrams show default label config for legend connections
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__c814173c-590e-47c3-b5cf-b7bcc7ae356e.json
policy:
after: 41d340e6-afae-44bd-82e7-41ab673c94e0
branch: f_451_diagrams_show_default_label_config_for_legend_connections
worktree: 2
---

We can already configure legend items in the diagrams legend list. For connection types, we need to add an option so that the user can specify that the legend label should also be used as the `default` label for connections between nodes that are of the selected legend-type

## Current state

* Each connection legend entry stores `id`, `kind`, and `label`. Edges reference one compatible entry through `legendEntryId`.
* Selecting a connection legend entry makes `DiagramEdgeDrawingService` use that exact entry when a compatible edge tool creates an edge. The selected entry therefore identifies both connection kind and user-defined legend classification.
* Legend rows allow label, order, removal, selection, and formatting changes. They expose no default-label setting.
* `DiagramEdgeDrawingService.completeTarget` normally creates an edge without a label. `requiredLabel` adds `New branch` or `New transition` only when flow validation requires a label. A label supplied by the active tool already takes priority.
* Changing a legend label does not change labels stored on existing edges.

## implementation details

* Define **default label** as a value copied into a newly drawn edge when its creation defaults contain no label. It is not a live reference: later legend-label changes leave existing edges unchanged.
* Bump diagram data to version 3. Add required boolean `useLabelAsDefault` to connection legend entries only. Version 1 and 2 migration sets it to `false`; new and derived connection entries also start as `false`. Node legend entries must not accept this field.
* Update `shared/diagram_data.mjs` and `shared/diagram_data.d.mts` so parsing, validation, migration, and canonical serialization preserve the field. No runtime fallback may infer it from label or connection kind.
* Extend legend editing, field snapshots, scoped events, subscriptions, dirty tracking, and change descriptions for `useLabelAsDefault`. A setter must address one entry by `legendEntryId` and reject node entries.
* In editable legend rows, show a `Use as default label` checkbox only for connection entries. Toggling it writes through `DiagramLegendEditor`; read-only legends and node entries show no checkbox. Keep existing label, select, reorder, remove, and format behavior.
* Carry `useLabelAsDefault` through `DiagramLegendEntry` and `DiagramSessionLegendEntries`. Subscribe each connection row to its own field event so toggling one entry rerenders only that entry.
* During edge completion, resolve the actual connection legend entry after `edgeClassification`. Choose label in this order: explicit tool label, selected entry label when `useLabelAsDefault` is true, existing required-label placeholder, or no label. Duplicate legend entries with the same `kind` must use their own flag and label, selected by `legendEntryId`.
* Do not apply defaults when an existing edge changes legend entry, when an edge is pasted, or when a diagram is loaded. Those operations already carry edge data and must not overwrite its label.
* Add focused tests for version migration and round-trip validation; legend setter events, dirty state, and change descriptions; checkbox visibility and updates; exact selected-entry resolution; label priority; and unchanged existing edges. Run affected diagram tests and `npm run lint` in `app/`.

## acceptance criteria

1. Every editable connection legend row shows `Use as default label`; node legend rows and read-only legends do not.
2. Enabling or disabling the option persists on that connection legend entry and survives save and reload.
3. Drawing an edge with an enabled selected legend entry copies that entry's current label into the new edge.
4. Drawing an edge with the option disabled keeps current behavior: it is unlabeled unless diagram validation requires a placeholder.
5. An explicit tool-supplied label wins over the legend default. A legend default wins over `New branch` or `New transition` when either placeholder would otherwise be required.
6. Connection legend entries sharing one `kind` can use different labels and settings; the new edge uses the entry referenced by its `legendEntryId`.
7. Renaming or disabling a legend entry affects only later edge creation. Existing edge labels, pasted edges, loaded edges, and edges reassigned in details remain unchanged.
8. Version 1 and 2 diagrams migrate with the option disabled and without changes to existing edge labels or rendered structure.
