---
author:
id: F_277
internalId: d8f5366f-df99-4b4a-9537-15b3e395fbfb
title: track diagram changes
status: ready for implementation
owner:
affects:
agents:
policy:
after: 5347a970-419c-495a-9b4e-c9aafcce6741
branch: f_277_track_diagram_changes
worktree: 3
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Maintain a semantic change set between the immutable original and editable diagram.

## Scope

* Consume the scoped mutation information produced by F\_276; never diff, clone, stringify, parse, serialize, or traverse the complete diagram after an edit.
* Key field changes by object kind, stable object ID, and field. Store the original field value once and update only the latest value.
* Track additions and removals through collection events. Add-then-remove eliminates that object's entries without inspecting unrelated objects.
* Remove a field change when its latest value equals its stored original value.
* Maintain dirty as whether the change registry contains any entry. Update that primitive only when registry membership crosses between empty and non-empty.
* Expose stable ordered change-ID snapshots whose references change only when change membership or order changes. A change leaf subscribes to its own fields.

## Acceptance criteria

* Move-then-move records one final move; add-then-delete records no change.
* Changes never depend on derived label positions, fan-in counts, surface size, or other positioned fields.
* Updating one node field touches only that field's change entry and dirty primitive.
* Reverting a field removes its entry without comparing complete objects or diagrams.
* The review collection rerenders only when change membership or order changes; updating one existing entry rerenders only its leaf.

## Dependencies

[F\_329](F_329_make_diagram_edit_updates_granular.md) and [F\_276](F_276_add_diagram_mutation_operations.md).