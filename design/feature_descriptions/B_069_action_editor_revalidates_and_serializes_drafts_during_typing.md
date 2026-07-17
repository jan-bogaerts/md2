---
id: B-069
title: action editor duplicates graph validation and JSON equality
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Every draft revision runs whole-action-graph validation in `ActionEditor`, including revisions produced by each keystroke. External reconciliation also implements definition equality inside the React component by recursively normalizing both objects and comparing `JSON.stringify` output.

The earlier parser round trip described by [[B-059]] has been removed, but persistence-format work has leaked back into the UI lifecycle. Validation cost scales with the complete action graph, while echo/conflict detection duplicates structured equality rules in a component and contradicts the action-editor contract that serialization occurs only at a valid persistence boundary.

## Fix

- Keep structured definition identity, revision, and origin metadata in the action service or save coordinator.
- Recognize local save publication by explicit path/revision or operation identity, not normalized JSON equality.
- Remove recursive normalization and `JSON.stringify` equality from `ActionEditor`.
- Separate cheap field-level feedback from graph validation where useful, while preserving authoritative graph validation before persistence.
- Do not parse or serialize invalid drafts.

## Edge cases

- Optional properties with `undefined` values.
- Property-order-only file changes.
- Arrays whose ordering is meaningful.
- A local save echo arriving after a newer local revision.
- A genuine external change matching an older local snapshot.
- Large action graphs with references and cycles.

## acceptance criteria

- Typing does not perform JSON serialization for draft equality or save-echo recognition.
- Local save echoes and genuine external changes are distinguished by explicit revision/origin metadata.
- Authoritative graph validation still runs before persistence and rejects invalid references, cycles, and definitions.
- Field editing remains responsive with a large action graph.
- Tests cover undefined optionals, property ordering, stale local echoes, genuine external changes, and validation-call boundaries.

## see also

- [[B-052]]
- [[B-059]]
- [[B-068]]
- `design\architecture\initial description\writings\action_editor.md`
