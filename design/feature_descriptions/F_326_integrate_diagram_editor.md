---
author:
id: F_326
internalId: 59dd5932-3f6c-4b9e-aa4e-99c2c0419b7d
title: integrate diagram editor
status: new
owner:
affects:
agents:
policy:
after: 2c3dd0ae-5b3d-44e6-8186-a7c28544995a
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Complete cross-feature integration after the focused editor jobs have landed.

## Scope

Resolve integration seams only: comparison modes, toolbox overlays, legend, breadcrumbs, drill-down menus, action popup, change review, agent handoff, focus, mobile layout, and all five renderers. Do not add new tools or requirements. Copy persistence remains F_327.

## Acceptance criteria

* Architecture, dependency, sequence, both flow presets, and entity diagrams complete their supported edit workflows.
* Current remains immutable; New remains canonical and valid.
* Pointer and keyboard behavior work at supported zoom levels and comparison layouts.
* Review and agent handoff use the same current edit-session data.
* Focused integration tests pass, existing diagram tests remain valid, and app lint passes.

## State and rendering rule

Integration must preserve the F_329 event graph. Add render-count tests for metadata, node, edge, group, fragment, selection, geometry, zoom, and tool changes. Each test must prove the owning leaf rerenders and root, parent, collection, sibling, and unrelated leaves do not.

## Dependencies

All earlier F_255 jobs. Copy persistence is completed by [F_327](F_327_save_edited_diagram_as_copy.md).
