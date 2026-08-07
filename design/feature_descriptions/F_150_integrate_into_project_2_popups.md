---
author: 
id: F_150
internalId: 81dcbcc1-3401-4927-a76e-2f3ef4874190
title: Integrate into project 2 popups
status: ready
owner: 
affects:
agents:
  - design/activity/card__81dcbcc1-3401-4927-a76e-2f3ef4874190.json#conversation=agent-5ebd95bb-3bc3-40e5-a0b1-d5a14aa29c4b
  - design/activity/card__81dcbcc1-3401-4927-a76e-2f3ef4874190.json#conversation=agent-6e9f7570-a8a2-4bdc-a925-7c334dbe4a17
policy:
after: 63ee96f0-2707-4a40-80df-dab5b0efda35
---

we recently introduced the ability to delete a branch after it has been integrated into the project. this works, however, on the ui, these are now 2 dialog boxes, a first to select if the branch should be deleted and a second to ask for a commit message. this should be on 1 and the same dialog

## Current state

Selecting **Integrate into project** for a card always opens `WorktreeIntegrationDialog`, which contains the persisted **Delete branch** choice. If the assigned worktree has uncommitted changes, confirming that dialog closes it and opens `WorktreeCommitDialog` for the commit message. Confirming the second dialog commits the changes, integrates the worktree, then requests branch deletion when selected. A clean worktree that is already ahead needs no commit and integrates from the first dialog.

## Implementation details

Keep one card-integration dialog in `WorktreeSelector`. When the assigned worktree is dirty, prepare the existing default card commit message before opening the dialog and show an editable commit-message field beside **Delete branch**. When the worktree is clean, omit the field because no commit occurs.

On confirmation, disable the dialog controls. For a dirty worktree, call `commitCardWorktree` first; only after that succeeds call `integrateCardWorktree` with the selected delete-branch value. A commit failure must leave the dialog open and must prevent integration. Close the dialog after the full operation succeeds; report failures through `dialogService` with the existing commit and integration error meanings.

Remove the card-integration transition from `WorktreeIntegrationDialog` to `WorktreeCommitDialog` and remove state used only to carry the delete choice between those dialogs. Keep `WorktreeCommitDialog` for standalone commits, updates, and dirty project-worktree integration. Keep `react.deleteBranchAfterIntegration` persistence and all `WorktreeService`, storage, Electron bridge, merge, and post-integration branch-cleanup behavior unchanged.

## Acceptance criteria

- Integrating a dirty card worktree opens one dialog containing the prefilled commit message and **Delete branch** checkbox; no second dialog opens.
- Integrating a clean card worktree opens the same integration dialog without a commit-message field and does not create a commit.
- For a dirty worktree, blank or whitespace-only commit messages disable confirmation.
- Confirmation commits dirty changes before integration. If commit fails, integration and branch deletion do not run, the dialog remains open, and the error is reported.
- After a successful commit, integration receives the checkbox value. Branch cleanup still starts only after successful integration.
- The delete-branch choice is restored when the dialog opens and persisted when the user changes it.
- Cancel closes the dialog without committing, integrating, or deleting a branch.
- While commit or integration is running, dialog controls cannot start another operation.
- Standalone commit, update, project-worktree integration, and clean card-integration behavior remain unchanged except for the unified dialog presentation.
