---
author:
id: F_280
internalId: acc5894b-b0b6-4024-88fe-be8f89ccfa36
title: add current and new diagram comparison
status: new
owner:
affects:
agents:
policy:
after: 2be66ea0-5097-4d45-a94e-d4a7b72331ca
---

Parent: [F_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Render the immutable current diagram and editable new diagram in one comparison surface.

## Scope

* Add labelled Current and New regions to Diagram View.
* Render both through the existing typed `DiagramRenderer`.
* Keep Current read-only and direct editing tools to New only.
* Preserve breadcrumbs, action menus, loading, empty, and error states.

## Acceptance criteria

* Current never changes during an edit session.
* Every accepted edit appears in New immediately.
* Existing diagram navigation works when no edit session is active.
* The comparison root owns layout; leaf components subscribe only to data they render.

## Dependencies

[F_275](F_275_add_diagram_edit_session_service.md) and [F_278](F_278_make_diagram_layout_compatible_with_editing.md).
