---
author:
id: F_273
internalId: cd29dd64-c875-44fb-b4c4-e131a4a113c8
title: define editable diagram contract
status: design
owner:
affects:
agents:
policy:
---
Parent: [F\_255 make diagrams editable](F_255_make_diagrams_editable.md).

## Goal

Pin down the editable JSON contract before interaction code is added. `DiagramData` remains canonical; `PositionedDiagramData` remains derived.

## Scope

* Define editable identities for nodes, edges, groups, fragments, metadata, and legend entries.
* Define original diagram, editable copy, saved copy, dirty state, and change-set terminology.
* State which geometry is persisted and which geometry is derived.
* Keep repository paths as persistence locations, never diagram or object identity.
* Document that the original diagram and its record are immutable.

## Acceptance criteria

* The contract covers all five diagram types and every object exposed by the toolbox.
* It defines ownership, identity, geometry, validation boundaries, and copy-save behavior without adding a second diagram model.
* Later jobs can reference the contract without choosing incompatible representations.

## Out of scope

UI, mutations, persistence implementation, and agent handoff.