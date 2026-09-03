---
author:
id: F_319
internalId: b1741e32-76ad-42d9-a014-6bccfec35e63
title: edit sequence fragments
status: new
owner:
affects:
agents:
policy:
after: 20805ee5-a17a-4a7d-803c-23e91bfae174
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add sequence-fragment editing to Others.

## Scope

Create, edit, and delete alt, opt, and loop fragments. Edit guards and assign ordered sequence edges to regions through a dialog.

## Acceptance criteria

* The tool appears only for sequence diagrams.
* Alt has exactly two regions; opt and loop have exactly one.
* Each region has a non-empty guard and at least one existing edge.
* An edge cannot appear twice in one fragment.
* Deleting an edge removes its fragment reference and reports a validation problem if a required region becomes empty.
* Derived fragment bounds update without becoming canonical state.

## Dependencies

[F_278](F_278_make_diagram_layout_compatible_with_editing.md), [F_279](F_279_validate_diagram_edit_operations.md), and [F_314](F_314_add_sequence_edge_tools.md).
