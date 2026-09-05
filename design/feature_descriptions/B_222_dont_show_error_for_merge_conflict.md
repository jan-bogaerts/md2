---
author: 
id: B_222
internalId: f54e020a-182e-4672-846e-ff0188657894
title: dont show error for merge conflict
status: ready
owner: 
affects:
agents:
  - design/activity/card__f54e020a-182e-4672-846e-ff0188657894.json
policy:
after: cffd0f4a-8cc4-4429-bacc-e08c28c7b233
branch: b_222_dont_show_error_for_merge_conflict
worktree: 1
---

we currently both show the merge conflict popup and a merge conflict error, we don't need to show the error: 'repository has an active merge conflict'

## Current state

Integration of a linked worktree can pause on a Git merge conflict. When that happens, `WorktreeService.integrate()` in `desktop/src/git/worktree_service.js` does not throw: it creates a merge conflict session through `createConflictSession()` and returns the outcome `{ session, status: 'conflict' }`. The renderer's `MergeConflictService` receives the new session over the `onMergeConflictSessionChanged` subscription, and `MergeConflictDialog` (mounted globally in `app/src/app.tsx`) opens because its `open` prop is `!!session`. That popup is the intended, correct feedback.

The unwanted second message comes from a follow-up call that runs after the conflict outcome is returned. In `app/src/components/worktree_selector.tsx`:

* `handlePrimary()` awaits `worktreeService.integrateCardWorktree(path, false)` on line 122 and then unconditionally awaits `worktreeService.setCardWorktree(path, null)` on line 123.
* `handleCommitIntegrateAndUnassign()` does the same on lines 261 and 269.

Because the integrate call resolved rather than rejected, both handlers treat a paused conflict as a finished integration and proceed to unassign the card. `setCardWorktree(path, null)` calls `storage.parkWorktree(...)` (`app/src/services/project/worktree_service.ts:209`), which reaches `WorktreeService.park()` in desktop. `park()` runs through `enqueueMutation()` with the default `allowConflict = false`, so `enqueueMutation` calls `mergeConflictService.assertMutationAllowed(this.project.rootPath)` (`desktop/src/git/worktree_service.js:679`). With a session active for that project root, `assertMutationAllowed()` throws `Error('Repository has an active merge conflict session')` (`desktop/src/git/merge_conflict_service.js:141`).

That rejection propagates back to the handler's `catch`, which calls `dialogService.error(error, { fallbackMessage: ... })`. `DialogService.error()` prefers `error.message` over the fallback, so the user sees the literal guard text `Repository has an active merge conflict session` alongside the merge conflict popup.

The guard itself is correct and must stay: it is what prevents a parallel Git index mutation while a conflict is paused. The defect is that the renderer issues a mutation that it should never have attempted. Conflict-aware operations (`continueConflict`, `abortConflict`, `synchronizeConflict`, `parkConflict`, `deleteBranchConflict`) already pass `allowConflict = true` and are unaffected. Other worktree menu actions cannot produce this collision, because `MergeConflictDialog` is a modal MUI `Dialog` and blocks interaction with the worktree selector while a session is open.

Note the same asymmetry exists for the dialog state: `handleCommitIntegrateAndUnassign()` closes the unassign dialog only on success or on error, so on a conflict outcome the unassign dialog would remain open behind the conflict popup.

## Implementation details

* Change `handlePrimary()` in `app/src/components/worktree_selector.tsx` to capture the result of `integrateCardWorktree(assignmentTarget.path, false)`. When `outcome.status === 'conflict'`, return without calling `setCardWorktree(assignmentTarget.path, null)`. Keep the existing unassign call for `status === 'completed'`.
* Change `handleCommitIntegrateAndUnassign()` the same way: when the integrate outcome is `conflict`, close the unassign dialog (`setUnassignDialogOpen(false)`) and return before the `setCardWorktree(..., null)` step, so the merge conflict popup is the only thing left on screen.
* Do not show any additional message on the conflict path. The merge conflict popup is the complete user feedback; no toast, warning, or info dialog is added.
* Leave `assertMutationAllowed()` and the `allowConflict` flag in `desktop/src/git/worktree_service.js` unchanged. The guard remains the backstop for any mutation attempted while a session is paused; this change removes the caller that hits it, not the guard.
* Leave error handling for genuine integration failures unchanged. When `integrateCardWorktree` rejects, the existing `catch` blocks and their fallback messages still apply.

## Edge cases and failure modes

* `deleteBranch` is `false` on both affected call sites, so `completeBranchCleanup()` in `data_service.ts` does not run when the conflict is later continued. After resolution the card therefore stays assigned to its worktree. That is the accepted behaviour for this fix; the user can unassign from the worktree menu once the popup closes.
* Aborting the conflict from the popup restores the checkpoint commits. The card assignment is still intact, which matches the pre-integration state.
* `handleIntegration()` (line 296) and the update and commit handlers already return the outcome without a follow-up mutation, so they need no change.
* A `completed` outcome must still unassign exactly as before, including the dirty-worktree retry path in `handlePrimary()`'s `catch` that reopens the unassign dialog.
* If `integrateCardWorktree` rejects for an unrelated reason while a conflict session happens to exist, the existing error dialog still reports that failure. Only the conflict outcome path is silenced.

## Tests

Extend `app/src/components/worktree_selector.test.tsx`:

* `handlePrimary` with an integrate outcome of `{ session, status: 'conflict' }` does not call `setCardWorktree` and does not call `dialogService.error`.
* `handlePrimary` with `{ status: 'completed' }` still calls `setCardWorktree(path, null)`, proving the existing flow is intact.
* The commit-integrate-and-unassign flow with a `conflict` outcome closes the unassign dialog, skips `setCardWorktree`, and shows no error dialog.
* The commit-integrate-and-unassign flow with a `completed` outcome still commits, integrates, and unassigns in that order.

Run `npm run test -- src/components/worktree_selector.test.tsx`, then `npm run typecheck` and `npm run lint` from `app`.

## Acceptance criteria

1. Integrating a card worktree that ends in a merge conflict opens the merge conflict popup and shows no error message.
2. The text `Repository has an active merge conflict session` is never shown to the user during a normal integrate-then-conflict flow.
3. No worktree unassign or park request is sent while the integrate outcome is `conflict`.
4. Committing first and then integrating into a conflict closes the unassign dialog and leaves only the merge conflict popup on screen.
5. A successful integration still unassigns the card exactly as before, including the dirty-worktree path that reopens the unassign dialog.
6. Real integration failures still surface their error dialog with the existing fallback messages.
7. The desktop `assertMutationAllowed()` guard and the `allowConflict` flags are unchanged.
8. Worktree selector tests, `npm run typecheck`, and lint pass.

## Out of scope

Automatically unassigning the card or deleting its branch after a conflict is resolved; changing the merge conflict popup layout or its resolve, continue, and abort behaviour; changing the desktop conflict session model, the `allowConflict` guard, or any other worktree operation's error reporting.
