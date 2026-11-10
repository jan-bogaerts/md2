---
author: 
id: J_68
internalId: 83c5615c-4c5c-4c99-8fa6-4ab6e1f61bd5
title: split action run history into focused units
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__83c5615c-4c5c-4c99-8fa6-4ab6e1f61bd5.json
policy:
after: d2e9440e-e79e-4abe-9092-d786540e29d3
branch: j_68_split_action_run_history_into_focused_units
worktree: 1
---

`app/src/components/actions/run/state/action_run_history.tsx` currently owns the history section layout, entry ordering, agent and command summary formatting, account-name resolution, error reporting, and entry rendering. Split these responsibilities into focused units without changing run-history behavior.

## Current state

`ActionRunHistory` reads the configured agent accounts, reports load errors, sorts entries, formats each entry, and renders the section and commit references. The component is small enough to understand, but its pure ordering behavior and individual entry presentation have no independent boundary. The existing test file consequently covers section behavior, entry formatting, ordering, and commit interaction together.

`ActionRunHistoryOwner` is the only caller. It subscribes to the popup-scoped `ActionHistoryStore`, loads history, and passes `entries` and `error` to `ActionRunHistory`. Agent and command popups each render the owner with their own runtime history store.

`ActionRunHistoryEntry` has no canonical run identifier. The current source index is required to preserve deterministic ordering when completion timestamps match and contributes to the React key, but it must not be promoted to domain identity.

## Implementation details

1. Keep `action_run_history.tsx` responsible for the run-history section, configured-agent-account subscription, error-reporting effect, and rendering of ordered entries.
2. Add `action_run_history_entry.tsx` for one history entry. Move agent and command summary construction, account-name resolution, completion-time formatting, and `CommitReferenceRow` rendering into this component.
3. Pass `accounts` and `entry` to the entry component. Keep the account configuration subscription at the list boundary so each row does not create its own subscription.
4. Add `action_run_history_order.ts` with the pure newest-first ordering operation. Preserve descending `completedAt` order, reverse source order for equal timestamps, and source-array immutability.
5. Keep ordering as presentation logic beside the component. Do not move it into `ActionHistoryStore` or mutate the model entries returned by the store.
6. Preserve the existing error behavior: report each new error through `dialogService` from an effect, reset error deduplication after recovery, and render no history section when there are no entries.
7. Preserve the current compact layout, labels, localized timestamps, agent configuration field order, unavailable-account label, command output, commit rows, and independent diff toggles.
8. Keep the source index for deterministic ties and list keys. Do not add a synthetic or path-based run identity; adding canonical run identity requires a separate domain-model change.
9. Clean up import ordering, component argument destructuring, and semicolon usage in the touched files according to the current project conventions.
10. Do not extract trivial one-line date, label, or account helpers into additional files. Keep entry-specific presentation logic together in `action_run_history_entry.tsx`.

## Tests

* Keep section-level tests in `action_run_history.test.tsx`: empty history, error reporting, and section rendering.
* Add `action_run_history_entry.test.tsx` for agent configuration, current account-name resolution, unavailable accounts, command output, commit rows, and diff interaction.
* Add `action_run_history_order.node.test.ts` for newest-first ordering, equal-timestamp tie-breaking, and source-array immutability.
* Run the focused tests and the app linter. Do not run the full test suite for this refactor.

## Acceptance criteria

* `action_run_history.tsx` contains only section-level presentation, account subscription, error reporting, ordering invocation, and entry composition.
* Entry formatting and commit rendering are owned by `action_run_history_entry.tsx`.
* Newest-first ordering is a pure function in `action_run_history_order.ts` and does not mutate its input.
* Equal completion timestamps retain the existing reverse-source-order behavior.
* Agent, account, model, thinking level, permission mode, and speed information render in the existing order and format.
* Command status, output, completion time, commit summaries, and independent diff toggles behave as before.
* Empty history and history-load errors behave as before, including deduplicated dialog reporting.
* No new run identity, compatibility branch, configuration flag, service behavior, or popup runtime behavior is introduced.
* `ActionRunHistoryOwner` and `ActionHistoryStore` remain unchanged; removing owner components belongs to the separate owner-component architecture work.
* Focused tests and lint pass.
