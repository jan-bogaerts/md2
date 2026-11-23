---
author: 
id: B_380
internalId: b93ea5b8-ac54-4402-ba40-b259824fc10a
title: resolve merge conflicts remains open too long
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__b93ea5b8-ac54-4402-ba40-b259824fc10a.json
policy:
after: d09dffff-8eaf-40b4-a7b4-2a25c28f9923
changedFiles:
  - app/src/components/merge_conflict_dialog.test.tsx
  - app/src/components/merge_conflict_dialog.tsx
  - app/src/services/project/merge_conflict_service.node.test.ts
  - app/src/services/project/merge_conflict_service.ts
---

## Current state

After all conflicted files are staged, the user presses Continue to resume the paused Git operation. The renderer sets `MergeConflictService` to busy and waits for the desktop operation to finish. The dialog remains open, but it only disables its controls and continues to show "All conflict entries are staged. Continue when ready." It provides no indication that Continue is running.

Continue completes more than the paused Git command. The desktop may finish a rebase or squash integration, synchronize and refresh the worktrees, clean up the branch, and record the integration in the card activity. It deliberately retains the conflict session until finalization succeeds so a cleanup or activity-write failure can be shown and retried safely. The dialog therefore needs to remain open until the desktop reports completion.

The worktree selector animation does not cover this interval. Its operation state ends when the original integration returns a conflict, before the later Continue operation starts.

## Implementation details

Extend the `MergeConflictService` snapshot with service-owned operation state that identifies when Continue is running. Set that state before calling `continueMergeConflict` and clear it in the existing `finally` path. Preserve the current busy state, disabled controls, error reporting, session lifetime, finalization, and retry behavior.

While Continue is running, replace the staged-success message with a spinner and text stating that the integration is being finished and the project is being updated. Change the Continue button label to "Finishing..." and show the same progress indication on the button. Keep the dialog open until the conflict session closes or the operation fails.

Do not connect this feedback to the worktree selector. The conflict dialog is guaranteed to be visible during this operation, while the selector may not be visible and its operation state represents a different lifecycle.

Add focused component and service tests for the Continue operation state, progress message, spinner, disabled controls, successful closure, and failure retry state.

## Acceptance criteria

- Pressing Continue immediately replaces the staged-success message with a visible spinner and a message that the integration is being finished and the project is being updated.
- The Continue button shows "Finishing..." with a progress indicator while the operation is running.
- Continue, Cancel, and conflict-resolution controls remain disabled while Continue is running.
- The dialog remains open until desktop finalization succeeds and then closes through the existing session-closing flow.
- If finalization fails, the existing error is shown, the progress state ends, and the dialog remains available so the user can retry Continue.
- Branch cleanup, integration activity recording, affected-path reload, and conflict-session retry behavior remain unchanged.
- The worktree selector behavior remains unchanged.
