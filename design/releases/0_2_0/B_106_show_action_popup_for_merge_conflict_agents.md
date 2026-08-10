---
author:
id: B_106
internalId: 462c0295-af05-49cb-8b20-6cdb2f19f683
title: show action popup for merge conflict agents
status: ready
owner:
affects:
  - app/src/components/merge_conflict_dialog.tsx
  - app/src/components/merge_conflict_dialog.test.tsx
  - app/src/services/project/merge_conflict_service.ts
  - app/src/services/project/merge_conflict_service.node.test.ts
agents:
policy:
  checkLinting: true
  requireTests: true
after: 3373bf52-14c0-4cc7-8f7c-555c835af9a0
---

## Goal

Open the standard action popup when a merge-conflict agent action is selected so the user can inspect the prompt, start the action, follow its conversation and tool activity, and handle agent interaction.

## Current architecture

`MergeConflictDialog` calls `MergeConflictService.runAgent` directly. The service marks the complete merge dialog busy, starts the action through `ActionRunRegistry`, waits for the terminal result, and then rescans the conflict session.

The action run publishes its normal conversation, approval, question, output, and status updates, but no `ActionPopup` is mounted for its merge-conflict context. The dialog therefore remains disabled while the user cannot see or interact with the running agent.

`MergeConflictService.runAgent` has one production call site: `MergeConflictDialog`. Other action entry points already use the universal `ActionPopup` and must keep their current behavior.

## Required change

- Selecting a per-file or resolve-all agent action opens `ActionPopup` with that action selected. Opening the popup does not start the action.
- Build one canonical merge-conflict `ActionContext` through `MergeConflictService`:
  - `kind` is `merge-conflict`;
  - `conflictSessionId` identifies the active session;
  - `conflictFiles` contains the current unresolved repository-relative paths separated by newlines;
  - `conflictFile` is present only for a per-file action.
- Start, continue, cancel, approve, answer, and display the action through the existing popup and `ActionRunRegistry` paths. Do not add a merge-specific agent runner or duplicate conversation state.
- Remove the direct `MergeConflictService.runAgent` execution path. Keep merge-conflict session construction and Git rescanning in `MergeConflictService`.
- Retain the selected popup context after the popup is visually closed. While its action run is active, selecting the matching merge action reopens the same popup and does not start a duplicate run.
- While a merge-conflict action run is active, disable external resolver, mark-resolved, Continue, Cancel, and unrelated agent-start operations that could mutate the paused Git operation.
- Derive active state from the scoped action run for the retained merge-conflict context. Do not add a second running-state registry or revision counter.
- When a run for that context reaches `completed`, `failed`, `cancelled`, or `okButNotAfter`, rescan the active conflict session. A non-completed agent may still have changed or staged files, so Git remains the source of truth.
- Keep the popup inspectable after the terminal result. Re-enable merge controls from the rescanned session state.
- Report popup-launch and rescan failures through `dialogService`.

No desktop bridge, Git merge implementation, action-run protocol, or agent-runner change is required.

## Compatibility and failure handling

- Per-file and resolve-all contexts remain distinct through `actionContextIdentity`; a run for one conflicted file must not bind to another file's popup.
- A session change or abort must not apply a late rescan result to a different conflict session.
- Closing the popup must not cancel its action run or discard its conversation.
- A failed rescan leaves the current session visible and reports one user-facing error.
- Existing external-resolver, manual mark-resolved, Continue, Cancel, action filtering, and merge completion behavior remain unchanged.

## Acceptance criteria

- Clicking a configured merge-conflict agent action opens the standard action popup with the clicked action selected and the correct per-file or resolve-all context.
- The action does not start until the user invokes Send in the popup.
- A running merge-conflict agent displays streamed conversation entries, tool activity, approvals, questions, errors, cancellation, and terminal status through the existing popup components.
- Git-mutating merge controls are disabled during the run, while the active popup can be reopened without starting another run.
- Every terminal result triggers one rescan for the same active conflict session, and the dialog updates from the returned unresolved paths.
- Terminal results remain inspectable after the merge controls are re-enabled.
- No merge-specific conversation or action-run state is introduced.

## Testing implications

- Dialog tests cover opening per-file and resolve-all popups, correct context values, delayed start through Send, active-run disabling, popup reopening, and prevention of duplicate runs.
- Service tests cover canonical context construction and session-bound rescanning.
- Regression tests cover completed, failed, cancelled, and `okButNotAfter` rescans, stale session protection, and rescan error reporting.
- Run app lint and tests.
