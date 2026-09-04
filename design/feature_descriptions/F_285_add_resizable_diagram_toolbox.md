---
author:
id: F_285
internalId: 2e295c0c-a5eb-4b2f-a36a-6c6f202a750a
title: add resizable diagram toolbox
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__2e295c0c-a5eb-4b2f-a36a-6c6f202a750a.json
policy:
after: 2a79aab5-7f0a-4c3e-9259-2ffdc6878f3b
branch: f_285_add_resizable_diagram_toolbox
worktree: 2
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Add a floating toolbox over the New diagram using the existing resizable popup component.

## Scope

Render Edit, Nodes, Edges, Groups, and Others as tabs. Tool buttons use horizontal flex layout with wrapping. Keep the toolbox inside the New viewport and retain its size during the edit session.

## Acceptance criteria

* The toolbox floats above New without scrolling with diagram content.
* It can be resized through accessible handles and remains reachable after viewport changes.
* Tabs and buttons have labels and tooltips.
* The toolbox does not cover Current in tabbed or split layouts unless New owns that viewport.

## State and rendering rule

The toolbox shell observes only toolbox geometry and active-section state. Each tool button subscribes to its own availability or active primitive where needed. No toolbox component subscribes to complete diagram data, selection objects, or positioned data.

## Dependencies

[F\_280](F_280_add_current_and_new_diagram_comparison.md).