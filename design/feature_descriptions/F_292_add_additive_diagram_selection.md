---
author:
id: F_292
internalId: 91ef53f7-f3da-4b1a-acf1-ca3520128a0f
title: add additive diagram selection
status: new
owner:
affects:
agents:
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Allow Ctrl-click to add or remove individual objects from selection.

## Acceptance criteria

* Ctrl-clicking an unselected node, edge, or group adds it.
* Ctrl-clicking a selected object removes only that object.
* Plain click still replaces selection.
* The behavior works with mixed object kinds and does not trigger moving, resizing, or drill-down.
* Tests use actual user interaction rather than service internals.

## State and rendering rule

Ctrl-click changes one identity's selected membership in place and dispatches events only for that identity plus the selection-membership view used by selection-specific controls. It does not publish diagram data or rebuild selected objects.

## Dependencies

[F_291](F_291_add_direct_diagram_selection.md).
