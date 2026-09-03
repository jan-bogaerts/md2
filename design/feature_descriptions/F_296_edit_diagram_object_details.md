---
author:
id: F_296
internalId: 62bae796-a019-452e-bc44-8d2a62318b48
title: edit diagram object details
status: new
owner:
affects:
agents:
policy:
after: f24dc638-db21-4d13-b5ec-bf173913a69b
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Open an object-specific details editor by double-clicking a node, edge, or group.

## Scope

Use one dialog shell with focused editors for each object kind. Fields come from the validated diagram schema and diagram type. Dialog buttons appear bottom right; validation errors remain in the dialog and operational errors use `dialogService`.

## Acceptance criteria

* Double-click opens details for the identified object without also moving or drilling down.
* Save invokes focused mutation operations; Cancel changes nothing.
* Unsupported fields are not shown for the active diagram type.
* Missing selected objects close safely and report the real error outside render.

## Dependencies

[F_276](F_276_add_diagram_mutation_operations.md), [F_279](F_279_validate_diagram_edit_operations.md), and [F_291](F_291_add_direct_diagram_selection.md).
