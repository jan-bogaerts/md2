---
author:
id: F_285
internalId: 2e295c0c-a5eb-4b2f-a36a-6c6f202a750a
title: add resizable diagram toolbox
status: new
owner:
affects:
agents:
policy:
after: 2023c646-c9c0-43ae-92f7-5619042cb465
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Add a floating toolbox over the New diagram using the existing resizable popup component.

## Scope

Render Edit, Nodes, Edges, Groups, and Others as tabs. Tool buttons use horizontal flex layout with wrapping. Keep the toolbox inside the New viewport and retain its size during the edit session.

## Acceptance criteria

* The toolbox floats above New without scrolling with diagram content.
* It can be resized through accessible handles and remains reachable after viewport changes.
* Tabs and buttons have labels and tooltips.
* The toolbox does not cover Current in tabbed or split layouts unless New owns that viewport.

## Dependencies

[F_280](F_280_add_current_and_new_diagram_comparison.md).
