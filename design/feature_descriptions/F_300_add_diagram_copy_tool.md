---
author:
id: F_300
internalId: 1baf99c7-1d5e-40a4-8702-29de72e0be62
title: add diagram copy tool
status: new
owner:
affects:
agents:
policy:
after: 1d937bde-19d5-467d-ad73-67ef587493fe
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add Copy and a versioned internal diagram-fragment clipboard format.

## Scope

Serialize selected nodes, edges, groups, and relevant group or fragment relationships without copying the complete diagram. Clipboard data retains source IDs only for internal relationship reconstruction.

## Acceptance criteria

* Copy does not mutate selection, diagram data, or dirty state.
* Only edges with both required selected endpoints are included automatically.
* The clipboard payload is versioned and validated before paste.
* Clipboard failure is reported through `dialogService`.
* Copy is disabled for empty selection.

## State and rendering rule

Copy is a read boundary over selected identities. It reads only selected objects and required relationships, dispatches no state event, and never clones or traverses the complete diagram.

## Dependencies

[F\_290](F_290_add_diagram_selection_service.md).