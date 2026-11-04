---
author: 
id: B_323
internalId: dbff8fd6-e09c-4ab4-909b-a2a15429e374
title: drop changes does not work
status: ready
owner: 
affects:
agents:
  - design/activity/card__dbff8fd6-e09c-4ab4-909b-a2a15429e374.json
policy:
changedFiles:
  - desktop/src/git/worktree_service.js
  - desktop/src/git/worktree_service.test.mjs
after: 594d4ee7-d414-4c2e-9257-09c64c0404bd
---

while trying to remove a worktree from a card that tried to do some work, we got a dialog with this request:



Worktree has uncommitted changes
Commit and integrate changes into the project before returning this worktree to its parked state, or permanently drop all tracked and untracked changes.

Commit message



when user selects 'drop changes' we get the error:

> Command failed: git clean -fd
> warning: could not open directory 'detector/.pytest_cache/': Permission denied
> warning: failed to remove detector/.pytest_cache/: Directory not empty

this is not ok.

when user selects `drop changes` just drop the changes. don't try to do something fancy.&#x20;

## Current state

* `WorktreeSelector` calls `worktreeService.discardAndUnassignCardWorktree` when user selects **Drop changes**. Renderer service discards changes, parks worktree, then clears card assignment. Any failed step stops later steps, so card stays assigned.
* Local and remote storage adapters send discard request through Electron bridge. `WorktreeService.discard` in `desktop/src/git/worktree_service.js` runs `git reset --hard HEAD`, then `git clean -fd`, then refreshes worktree state.
* Git runner rejects every nonzero command result. In reported case, `git clean -fd` removes Git-visible files but cannot traverse ignored `detector/.pytest_cache/`, exits nonzero, and aborts flow before parking.
* Worktree dirty state uses `git status --porcelain`. This output includes tracked and untracked changes, but excludes ignored files such as `.pytest_cache`. Ignored residue therefore does not prevent worktree from being clean enough to park.
* `WorktreeService.discard` has one production call site: Electron bridge discard handler. No caller needs old exit-code-only behavior.

## implementation details

* Change only `WorktreeService.discard` in `desktop/src/git/worktree_service.js`. Keep `git reset --hard HEAD` and successful `git clean -fd` behavior unchanged.
* If `git clean -fd` fails, immediately run `git status --porcelain` in same linked worktree:
  * Empty output means all tracked and untracked changes are gone. Continue refresh, then existing renderer flow parks worktree and clears card assignment.
  * Non-empty output means discard is incomplete. Rethrow original `git clean -fd` error. Existing renderer error dialog remains, and card assignment stays unchanged.
* Do not delete or recreate worktree, remove ignored files, change filesystem permissions, stop processes, or suppress a clean failure while Git still reports changes.
* Keep bridge, storage adapter, renderer service, dialog, parking, and assignment APIs unchanged. Local UI and remote-control clients receive same verified result through existing bridge contract.
* Add desktop service regression tests for failed `git clean -fd` followed by empty status and by remaining dirty status. Keep existing renderer sequencing: parking and unassignment occur only after discard resolves.
* Run `desktop/src/git/worktree_service.test.mjs` and desktop lint during implementation.

## acceptance criteria

1. Drop changes resets tracked changes, removes removable untracked files, parks worktree, and clears card assignment.
2. When `git clean -fd` exits nonzero only because ignored residue such as an unreadable `.pytest_cache` remains, Drop changes still parks worktree and clears assignment after `git status --porcelain` confirms no tracked or untracked changes.
3. Ignored residue is left untouched; Drop changes does not delete ignored files or alter permissions or running processes.
4. When tracked or untracked changes remain after failed clean, user sees discard error and worktree remains assigned and unparked.
5. Commit-and-integrate, normal parking, worktree removal, and primary-worktree change handling keep current behavior.
