---
author:
id: F_322
internalId: f4697a13-3aa5-4a9e-ba9f-83276e18557b
title: generate diagram change descriptions
status: new
owner:
affects:
agents:
policy:
after: 816a1ca0-a183-46b2-9f50-8045af076328
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Convert the semantic change set into deterministic text an implementation agent can follow.

## Scope

Describe additions, removals, detail changes, moves, resizes, connections, group membership, fragments, metadata, and legend changes using diagram labels plus stable IDs where labels are ambiguous.

## Acceptance criteria

* Output describes net changes, not the user's gesture history.
* Ordering is stable across repeated generation.
* Relationships name both endpoints and their edge kind.
* Geometry uses diagram coordinates and dimensions only when implementation meaning requires them.
* Empty change sets produce no implementation instructions.
* Tests cover every supported change kind and duplicate labels.

## State and rendering rule

Generation reads the change service, not the complete diagram. Updating one change invalidates only its generated line or the explicitly requested final text. Ordinary mutations do not regenerate the full textual report until review or agent handoff requests it.

## Dependencies

[F_277](F_277_track_diagram_changes.md).
