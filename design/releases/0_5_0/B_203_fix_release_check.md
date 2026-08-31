---
author: 
id: B_203
internalId: 3b6ae28a-dbbc-4229-be1b-f9b7ecd00fc1
title: fix release check
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__3b6ae28a-dbbc-4229-be1b-f9b7ecd00fc1.json
policy:
changedFiles:
  - app/src/services/release_operations.test.ts
  - app/src/services/release_operations.ts
after: 25d602ba-1743-4365-b35d-08224cd0b98e
---
we currently get an error like this: `Cannot complete release. Unassign worktrees from cards` for a card that is not in the `release` column. We should not check cards that are not being released.

## Current state

`ReleaseOperations` treats `snapshot.activeCards` as input for release preparation and completion. Here, **active cards** means every card in working folder, regardless of card `status`.

Release cards are narrower: cards whose `status` equals last configured state, called final column in code. Only release cards are archived. However, `requireNoAssignedWorktrees` currently checks every active card in both `getReleaseBranchCandidates` and `completeRelease`. Therefore, assigned worktree on card outside final column blocks release dialog and release completion, even though that card stays in working folder.

## implementation details

* In both `getReleaseBranchCandidates` and `completeRelease`, derive release cards from `activeCards` with existing `statusOf(card) === finalState.state` rule before checking worktrees.
* Pass only release cards to `requireNoAssignedWorktrees`. Rename helper parameter from `activeCards` to `releaseCards` so scope is explicit. Both verified call sites need same narrowed behavior; no compatibility flag or alternate mode is needed.
* Keep existing failure behavior for release cards with assigned worktrees: abort before commit, push, or branch deletion and list affected card IDs in existing error.
* Keep release-card locking, archiving, asset/activity handling, branch candidate filtering, and user-visible error path unchanged.
* Update `release_operations.test.ts` expectations that currently include non-release cards. Add regression coverage for mixed columns in both release preparation and completion.

## acceptance criteria

* Assigned worktree on card outside final column does not block opening release dialog or completing release. Card remains in working folder and is not archived.
* Assigned worktree on card in final column blocks release preparation and completion before commit, push, or branch deletion.
* Error lists every final-column card with assigned worktree and no card from another column.
* With mixed columns, branch candidates and archived cards still include only final-column cards.
* Existing behavior remains unchanged when no release card has assigned worktree, including error when final column contains no cards.
