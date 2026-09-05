---
author:
id: F_324
internalId: 7f17626c-05f4-40b0-9d26-824728c4cd43
title: pass diagram changes to an agent
status: ready for implementation
owner:
affects:
agents:
policy:
after: 2f0581e4-58bf-4995-a225-12ec0c03e9c0
---
Parent: [F\_255](F_255_make_diagrams_editable.md).

## Goal

Open an implementation action with the reviewed diagram changes as prompt context.

## Scope

Add a {{diagram-changes}} placeholder for diagram action context and resolve it from the active reviewed change set. The review action opens the existing ActionPopup; action definitions remain responsible for deciding where the text appears in their prompt.

## Acceptance criteria

* The placeholder resolves only when an active diagram edit session has a non-empty reviewed change set.
* Missing or stale review data fails clearly instead of producing an empty prompt.
* Existing diagram root and child action behavior is unchanged.
* The exact reviewed text is retained for the started run even if the user edits the diagram later.
* Context identity continues using diagram IDs, not paths.

## State and rendering rule

Agent handoff is an explicit output boundary. It captures the reviewed text once for the run without replacing edit-session state or subscribing action-popup parents to diagram fields. Later field events remain scoped to diagram leaves.

## Dependencies

[F\_323](F_323_add_diagram_change_review.md).