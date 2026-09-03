---
author:
id: F_288
internalId: ec72c355-fcfa-4d53-ad26-3812fcb1c7ba
title: add diagram zoom out tool
status: new
owner:
affects:
agents:
policy:
after: 47be0198-e3ae-4ef7-9d06-3fcf5c7fd6b9
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add Zoom Out to the Edit section.

## Acceptance criteria

* Each activation decreases only the New viewport scale by a defined step down to a named minimum.
* Zoom does not modify diagram coordinates or the change set.
* The visible center remains stable where possible.
* The button disables at minimum zoom and has an accessible label.
* Selection, placement, moving, and resizing remain accurate after zooming out.

## State and rendering rule

Zoom is one service-owned viewport primitive. Only the New viewport transform and controls that display or constrain zoom subscribe to it. Zoom does not publish diagram, geometry, collection, selection, comparison-root, or toolbox-root events.

## Dependencies

[F_287](F_287_add_diagram_zoom_in_tool.md).
