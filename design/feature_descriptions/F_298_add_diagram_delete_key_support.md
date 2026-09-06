---
author:
id: F_298
internalId: 531e8784-9f9b-42d0-9eba-1f62646227f4
title: add diagram Delete key support
status: ready
owner:
affects:
agents:
  - design/activity/card__531e8784-9f9b-42d0-9eba-1f62646227f4.json
policy:
changedFiles:
  - app/src/components/diagram_view/use_diagram_delete_key.test.tsx
after: 20ddf6f5-ccf5-4017-96ab-94985cfbcf13
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Invoke the same deletion behavior from the Delete key.

## Acceptance criteria

* Delete removes the active selection only when focus belongs to the diagram editor.
* It does nothing while the user edits text, a dialog, a menu, or an action popup.
* Keyboard and toolbox deletion use the same service operation and cascading rules.
* The listener is installed and removed with the editor lifecycle.

## State and rendering rule

The keyboard handler delegates to the same granular deletion operation as the toolbox. It owns no diagram state and introduces no additional notification or rerender path.

## Dependencies

[F\_297](F_297_add_diagram_delete_tool.md).