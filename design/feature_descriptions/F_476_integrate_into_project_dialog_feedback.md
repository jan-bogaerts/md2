---
author: 
id: F_476
internalId: 5221030b-ed7e-4860-bd8f-177274dc9a02
title: integrate into project dialog feedback
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__5221030b-ed7e-4860-bd8f-177274dc9a02.json
policy:
branch: f_476_integrate_into_project_dialog_feedback
worktree: 1
---
we recently did some improvements to other dialogs, see [J_74_uncommitted_project_changes_dialog_improvements.md](design/feature_descriptions/J_74_uncommitted_project_changes_dialog_improvements.md) .&#x20;

now we need to do this for the 'integrate into project' dialog. We need to provide the user with some visual feedback on what is happening. right now, the dialog is disabled and the user has to wait a while until it disappears.

we should show the what the process is currently doing and some spinner or other feedback so the user knows a process is still running

## Current state

`WorktreeSelectorController` opens `WorktreeIntegrationDialog` for a card worktree. A dirty worktree is committed first; then `WorktreeService.integrateCardWorktree` saves pending project edits, asks the desktop host to integrate, handles any primary-project change review, queues integration activity, and optionally clears the card's branch assignment.

`WorktreeService` exposes only card-scoped `preparing` state for this workflow. The dialog uses that boolean to disable its fields, checkbox, buttons, backdrop close, and Escape close. It shows no spinner, status text, or changing action label, so users cannot distinguish a pending commit from integration work. Success closes the dialog. Failure is reported through `dialogService`; the dialog stays open and becomes usable again. A primary-change review or merge conflict already opens its own dialog.

## implementation details

* Replace the card operation's boolean-only snapshot with a card-scoped named phase while retaining `isPreparingCard` as the derived busy check. A phase is the named current step in one attempt. Publish phases for committing dirty worktree changes, saving pending project edits, integrating into the project, and finalizing card state. Notify only the existing event for that card internal ID.
* Update every `startCardOperation` call site explicitly. Assignment, update, discard, and unassignment keep their current generic busy behavior; commit and integration publish the new phases. No desktop bridge change is needed: its single integration promise does not expose finer Git substeps, so the UI must not claim more detail than the renderer knows.
* Include the current phase in `useWorktreeSelectorState` and pass it through `WorktreeSelectorController`. Keep operation state in `WorktreeService`; do not add a second workflow state in the React component.
* While a phase is active, show a theme-backed informational alert in `WorktreeIntegrationDialog` with an accessible `CircularProgress` and phase text. Show a small spinner in the primary action and change its label to `Committing...`, `Integrating...`, or `Finishing...` as applicable.
* Preserve the existing non-cancellable behavior: disable commit message, branch deletion, Integrate, Cancel, backdrop close, and Escape close until the current operation finishes. Keep the dialog mounted while its promise is pending.
* When primary-project changes require review or Git conflicts require resolution, let the existing foreground dialog provide progress and close the integration dialog according to the current outcome handling. Do not duplicate those workflows inside the integration dialog.
* On success, preserve current closure, activity, branch cleanup, and assignment behavior. On failure, clear progress, keep the integration dialog open, report the existing error, and restore valid controls. If the commit succeeded before integration failed, retry only integration because the worktree is already clean.
* Add focused service tests for card-scoped phase values and events. Add dialog and controller tests with deferred promises for immediate feedback, commit-to-integration phase changes, disabled dismissal, pending visibility, success closure, and failure recovery.

## acceptance criteria

* Starting integration immediately shows an accessible spinner and text naming the current known phase.
* Dirty worktrees show commit feedback before integration feedback. Clean worktrees start with integration feedback and do not show a commit phase.
* While work is pending, the dialog remains visible and its fields, checkbox, buttons, backdrop, and Escape key cannot change or dismiss the workflow.
* Primary-project review and merge-conflict dialogs remain the sole UI for their workflows; integration feedback does not obscure or duplicate them.
* Successful integration retains existing activity tracking, optional branch deletion, card assignment updates, and dialog closure.
* Failed commit or integration clears progress, reports the existing error, leaves the integration dialog open, and restores controls for a valid retry or cancellation.
* Progress styling uses MUI theme values and matches the informational alert and button-spinner pattern used by existing project dialogs.
* Focused `WorktreeService`, `WorktreeIntegrationDialog`, and `WorktreeSelectorController` tests pass, and `npm run lint` passes.
