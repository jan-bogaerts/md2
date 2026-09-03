---
author:
id: F_321
internalId: 816a1ca0-a183-46b2-9f50-8045af076328
title: edit diagram legend
status: new
owner:
affects:
agents:
policy:
after: 775fb7c0-979e-45ec-a05d-25c968335775
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add legend editing to Others.

## Scope

Allow users to add, rename, reorder, and remove explicit legend entries for node roles and edge kinds. This intentionally replaces a derived-only legend when F_271 is present: rendering uses explicit entries when saved by the editor and derives entries only when the diagram has none.

## Acceptance criteria

* Each entry identifies a supported node role or edge kind and has a non-empty label.
* Duplicate semantic entries are rejected.
* Reordering is persisted and reflected immediately in New.
* Removing a legend entry does not change nodes or edges.
* Existing diagrams without explicit legend entries retain their derived legend.
* Legend edits appear in the semantic change set.

## Dependencies

[F_276](F_276_add_diagram_mutation_operations.md), [F_285](F_285_add_resizable_diagram_toolbox.md), and [F_271](F_271_diagrams_add_legend.md).
