---
author:
id: F_327
internalId: 0a0fa053-2cfc-497e-9bb4-c3440ddb8638
title: save edited diagram as a copy
status: ready for implementation
owner:
affects:
agents:
policy:
after: 59dd5932-3f6c-4b9e-aa4e-99c2c0419b7d
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Save valid editable DiagramData without overwriting the original diagram file or record.

## Scope

On first save, serialize canonical editable data to a collision-free JSON path inside the configured diagrams folder and create a new stable DiagramRecord beside the source record in the same root or child collection. Record which original diagram started the copy. Subsequent saves in the same edit session update that saved-copy file and record.

## Acceptance criteria

* The original path, content, and DiagramRecord are never written or replaced.
* First save persists the new JSON and updated diagram index through the shared commit flow.
* The edit session retains the original as Current and binds later saves to the created copy.
* The saved copy can be opened through normal Diagram View navigation after the session.
* Save is disabled for an empty change set or invalid editable data.
* Persistence failure retains the complete edit session and does not publish a partial index.
* Stored JSON contains canonical data only, never positioned rendering fields.
* Tests cover root and child copies, repeated saves, path collisions, restart loading, and atomic failure.

## State and rendering rule

Save is a persistence boundary, so it may traverse and serialize the complete canonical diagram on explicit save. That read does not rebuild model objects or publish diagram events. Save status is its own primitive; only save controls subscribe to it. Successful persistence updates saved-record/path state without replacing the editable diagram or rerendering diagram leaves.

## Dependencies

[F\_277](F_277_track_diagram_changes.md), [F\_279](F_279_validate_diagram_edit_operations.md), and [F\_326](F_326_integrate_diagram_editor.md).