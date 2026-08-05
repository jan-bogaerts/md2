---
author: 
id: F_128
internalId: efdaf96e-da6f-4d8f-874f-042f30965276
title: Allow auto delete branch
status: design
owner: 
affects:
agents:
  - design/activity/card__efdaf96e-da6f-4d8f-874f-042f30965276.json#conversation=agent-74368566-29db-40ee-bab9-299acbddbe92
  - design/activity/card__efdaf96e-da6f-4d8f-874f-042f30965276.json#conversation=agent-e56a1e1a-42e8-4ce0-a3b3-0ad3c43838bc
policy:
after: 18fd04d3-5df7-4f54-ab7a-94d96f210f13
worktree: 1
---

When we assign a worktree to a card, a branch is auto created.

When that branch is merged back into project´s branch, we currently let the branch be.

The ´integrate into project´ dialog should have a checkbox to ´delete branch´. Last selected value needs to be persisted and restored. When selected, only delete branch after succesful merge.

When a release is done, for all cards that a branch was created and not yet deleted, show a checkbox in the release form so branches can still be deleted after release.

Users should be able to select - unselect all chzckboxes at once. Last selected value should be persisted and restored

## Current state

Assigning a card prepares a local branch derived from card ID and title, then stores only one-based worktree index in card frontmatter. Card does not retain branch name.

`Integrate into project` rebases branch when needed, squash-merges its changes into project branch, and synchronizes linked branch to new project commit. It neither asks for confirmation nor deletes branch. Returning card to Primary parks linked worktree and removes assignment, but leaves card branch in repository.

Release dialog accepts only release name. Release completion archives final-column cards, optionally pushes release commit, and does no branch cleanup. `F_87` is prerequisite: its assigned-worktree guard must pass before this feature offers release-time branch deletion.

## implementation details

- Persist generated branch name in card frontmatter when assignment succeeds. Keep it after normal unassignment so release flow can identify branch. Clear it only after confirmed branch deletion. A pending branch means card retains branch name and local branch still exists.
- Replace direct integration action with confirmation dialog containing `Delete branch`. Persist and restore last value globally through config service; do not store preference per card.
- When deletion is selected, finish squash integration first. After integration succeeds, park linked worktree, unassign card, force-delete local card branch, then clear stored branch name. Force deletion is required because squash integration does not make Git regard original commits as merged. Do not delete remote branches.
- If integration fails, do not park, unassign, delete, or clear branch name. If later cleanup fails, report partial failure through `dialogService`, keep branch name for retry, and make card assignment match actual worktree state.
- Extend desktop Git service, Electron and remote-control bridges, storage contracts, and renderer worktree service with explicit local-branch deletion. Validate branch name and reject project branch, parking branches, or any branch still checked out by a worktree.
- In release dialog, list undeleted branches only for cards included in current release. Add per-branch checkboxes plus `Select all` / `Clear all`. Persist and restore global select-all default; individual card selections are not persisted.
- Pass selected branch names into release completion. First archive cards and complete configured automatic push. Only after both succeed, delete selected local branches. Release failure deletes no branches. Branch-cleanup failure is reported as post-release partial failure and identifies every branch that was not deleted.
- Keep `F_87` guard before file moves. Release-time cleanup never parks or unassigns worktrees because release cannot start while any release card remains assigned.
- Add parser and card-operation tests for branch metadata; desktop Git and bridge tests for safe deletion; worktree integration tests for ordering and partial failures; dialog/config tests for restored defaults and bulk selection; release tests for candidate filtering and post-commit, post-push deletion timing.

## acceptance criteria

- Integration dialog always shows `Delete branch` with globally persisted last value.
- With deletion cleared, successful integration keeps assignment and local card branch.
- With deletion selected, successful integration parks worktree, unassigns card, deletes local card branch, and clears stored branch name.
- Failed integration leaves worktree assignment, branch, and stored branch name unchanged.
- Cleanup failure after successful integration reports completed integration plus failed cleanup, without losing branch identity needed for retry.
- Release dialog lists one checkbox for each undeleted local branch belonging to card in current release, and no branch from other cards.
- `Select all` and `Clear all` update every branch checkbox. Global select-all choice is restored next time; per-card choices are not.
- Release archive or automatic push failure deletes no selected branch.
- Successful release commit and automatic push happen before selected local branches are deleted. Unselected branches remain.
- Project branch, parking branches, remote branches, and branches checked out by any worktree cannot be deleted by this feature.
- Tests cover successful paths, no candidates, stale or missing branches, partial cleanup failure, restored defaults, and operation ordering.
