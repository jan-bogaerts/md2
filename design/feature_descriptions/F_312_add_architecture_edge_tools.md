---
author:
id: F_312
internalId: a19922cd-3580-4417-8906-3b8b73d4f46f
title: add architecture edge tools
status: new
owner:
affects:
agents:
policy:
after: ab22473c-bea7-4d12-aced-6628ef5c50f8
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add Connection and Data buttons for architecture diagrams, plus Async where supported by the architecture schema.

## Acceptance criteria

* The Edges section exposes only architecture-compatible kinds for an architecture diagram.
* Each button creates the selected kind through shared edge drawing.
* Existing solid, dashed, arrow, and label rendering semantics remain unchanged.
* Details can edit the optional label and reconnect either endpoint.
* Incompatible diagram types do not offer these buttons.

## Dependencies

[F_311](F_311_add_edge_drawing_infrastructure.md) and [F_296](F_296_edit_diagram_object_details.md).
