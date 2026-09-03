---
author:
id: F_325
internalId: 2c3dd0ae-5b3d-44e6-8186-a7c28544995a
title: handle diagram implementation runs
status: new
owner:
affects:
agents:
policy:
after: 7f17626c-05f4-40b0-9d26-824728c4cd43
---

Parent: [F_255](F_255_make_diagrams_editable.md).

## Goal

Track implementation runs started from a diagram change review without losing pending work.

## Acceptance criteria

* Failed, cancelled, or interrupted runs retain the editable diagram and reviewed change set for retry.
* A successful run marks that reviewed change set as delivered but does not discard edits or overwrite either diagram.
* Later edits create a new undelivered review state.
* Results are matched by canonical action, run, and diagram context identities, never output paths.
* Existing diagram-producing run handling remains unchanged.

## Dependencies

[F_324](F_324_pass_diagram_changes_to_an_agent.md).
