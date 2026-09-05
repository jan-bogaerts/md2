---
author:
id: F_320
internalId: 775fb7c0-979e-45ec-a05d-25c968335775
title: edit diagram metadata
status: new
owner:
affects:
agents:
policy:
after: 1d937bde-19d5-467d-ad73-67ef587493fe
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add diagram metadata editing to Others.

## Scope

Edit title and description through a dialog. Diagram type, schema version, and flow preset remain fixed because changing them would invalidate the complete document.

## Acceptance criteria

* Title and description are required, trimmed, and updated through focused service operations.
* Cancel changes nothing.
* Current continues showing original metadata while New updates immediately.
* Type, version, and preset are displayed only when useful and cannot be changed.
* Metadata edits appear in the semantic change set.

## State and rendering rule

Title and description are separate service-owned fields with separate events. Editing one assigns only that field. The leaf displaying it rerenders; diagram root, object collections, nodes, edges, groups, and the other metadata field do not rerender.

## Dependencies

[F_276](F_276_add_diagram_mutation_operations.md) and [F_285](F_285_add_resizable_diagram_toolbox.md).
