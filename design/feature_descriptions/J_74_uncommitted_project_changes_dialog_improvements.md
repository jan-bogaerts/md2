---
author: 
id: J_74
internalId: 62551bdc-c0ce-4290-93cc-257fa4d5edc1
title: uncommitted project changes dialog improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__62551bdc-c0ce-4290-93cc-257fa4d5edc1.json
policy:
---

While the commit operation is running, the dialog is simply disabled. we should add some animation to show a process is running and include a little text to show what is occuring.

we just recently did something similar for merge I think, perhaps use similar style

## Current state

`PrimaryChangesDialog` opens when worktree integration finds changes in the primary project branch. `PrimaryChangesService.confirm` marks the service busy, calls `StorageService.commitPrimaryChanges`, and closes the dialog after success. `WorktreeService` then retries integration. A failed commit is reported through `dialogService`; the dialog remains open with the entered message so the user can retry.

The shared busy state covers both committing and moving a file to trash. It disables the OK and trash controls and makes Cancel a no-op, but it does not identify which operation is running. During a commit, the dialog shows no progress animation or status text, and the commit-message field remains editable. The merge-conflict dialog already uses the intended pattern: an informational alert with `CircularProgress`, explanatory text, and a progress state on the primary action.

## implementation details

* Add commit-specific state to `PrimaryChangesService`, separate from its generic busy state. Expose that state through a granular `EventTarget` event and a `useSyncExternalStore` hook. File-trash operations must remain busy without being presented as commits.
* Set commit-specific state immediately before `commitPrimaryChanges` starts. Clear it after failure, and reset it when the review finishes after success, cancellation, service reinitialization, or cleanup.
* While commit-specific state is active, show an informational alert in `PrimaryChangesDialog` with an accessible `CircularProgress` and text stating that project changes are being committed. Change the OK button label to `Committing...` and include a small spinner, matching the merge-conflict completion feedback.
* Disable the commit-message field, OK, Cancel, file-trash actions, backdrop close, and Escape close until the commit finishes. The commit is non-cancellable: after the storage call starts, dialog controls cannot stop it safely.
* Keep the dialog open while the commit promise is pending. On success, preserve current behavior: close the review, resolve it as confirmed, then let `WorktreeService` retry integration. On failure, remove progress feedback, keep the message and file list, report the existing error, and restore controls for retry.
* Add focused component tests with a deferred commit promise to verify immediate feedback, accessible progress, disabled controls, pending-dialog visibility, success closure, and failure recovery. Add service tests for commit-specific state and events. Keep storage and worktree integration contracts unchanged.

## acceptance criteria

* Starting a commit immediately shows a progress animation and text that identifies project changes as the operation in progress.
* While the commit is pending, the dialog stays open and no field, file action, button, backdrop click, or Escape key can start another action or close the review.
* Moving a file to trash does not show commit progress or the `Committing...` label.
* Successful commit closes the dialog, resolves the review as confirmed, and allows the existing integration retry to continue.
* Failed commit removes progress feedback, preserves the commit message and file list, reports the existing error, and permits retry or cancellation.
* Progress feedback is accessible and uses theme-backed MUI styling consistent with merge-conflict completion feedback.
* Focused `PrimaryChangesService` and `PrimaryChangesDialog` tests pass, and `npm run lint` passes.
