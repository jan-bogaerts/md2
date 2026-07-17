---
id: B-073
title: action editor has overlapping state and list implementations
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

`ActionEditor` combines draft lifecycle, validation, save sequencing, external reconciliation, conflict resolution, tabs, phrase editing, Markdown history, error UI, and complete editor layout in one component. Domain behavior therefore remains embedded in React despite the architectural decision that singleton services own domain state and logic.

The nested collection editors also duplicate ordered-list behavior. `ActionLinkListEditor` and `ActionOnRulesEditor` independently implement index parsing, add/remove, move up/down, action selection, hidden row controls, and indexed error display. Fixes to ordering, accessibility, stale selections, or identity can diverge between them.

## Fix

- Move action draft/save/conflict behavior to the action service or a focused action-editor state service/hook consistent with the service ownership rules.
- Keep `ActionEditor` responsible for composing editor sections and rendering state.
- Keep phrase editing and Markdown document management behind one focused component or hook.
- Extract shared ordered-row behavior only where the verified link-list and output-rule call sites require identical behavior. Keep their domain-specific fields and validation explicit.
- Do not add compatibility modes or generic abstractions for unverified consumers.

## Edge cases

- Indexed validation errors after moving or deleting rows.
- Stale or missing referenced actions.
- Empty before/after/rule collections.
- Focus retention after reorder and removal.
- Concurrent external action changes while a nested editor is active.

## acceptance criteria

- Domain draft/save/conflict orchestration is testable without rendering the full action editor.
- `ActionEditor` no longer owns the persistence queue or external reconciliation algorithm.
- Link lists and output rules share verified ordering mechanics without hiding their different domain payloads.
- Move, remove, stale-value, empty-state, accessibility, and error behavior remain consistent across all ordered action collections.
- Focused unit/component tests cover the extracted ownership boundaries and both collection editors.

## see also

- [[B-061]]
- [[B-068]]
- `design\architecture\architectural_decisions.md`
- `design\architecture\initial description\writings\action_editor.md`

