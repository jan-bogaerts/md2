---
author:
id: F_315
internalId: bb95c759-589b-43e9-968c-02f83b371438
title: add flow edge tools
status: new
owner:
affects:
agents:
policy:
after: 1d937bde-19d5-467d-ad73-67ef587493fe
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add Flow for flowcharts and Transition for state diagrams.

## Acceptance criteria

* Flow appears only for the flowchart preset; Transition appears only for the state preset.
* Decision branches require a label before a Flow edge is committed.
* Every Transition requires a label before it is committed.
* Both kinds use shared connection points, routing, selection, reconnection, and details.
* Invalid incomplete creation leaves the diagram unchanged.

## State and rendering rule

Flow and transition field changes stay on their stable edge objects. Validation reads the proposed edge and source node only. Creation updates edge membership once; editing or reconnecting notifies only that edge and directly affected endpoint leaves.

## Dependencies

[F_311](F_311_add_edge_drawing_infrastructure.md) and [F_279](F_279_validate_diagram_edit_operations.md).
