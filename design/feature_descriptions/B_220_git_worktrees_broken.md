---
author: 
id: B_220
internalId: 43b22d3f-d24d-4e09-b222-bafec56806ae
title: git worktrees broken
status: ready
owner: 
affects:
agents:
  - design/activity/card__43b22d3f-d24d-4e09-b222-bafec56806ae.json
policy:
changedFiles:
  - app/src/components/config/worktree_remove_dialog.tsx
  - patch_b220.py
  - patch_b220b.py
  - patch_b220c.py
  - patch_b220d.py
  - patch_b220e.py
  - patch_b220f.py
  - patch_b220g.py
  - patch_b220h.py
---
* tried removing a freshly created worktree where the agent apparantly made changes in the folder. refused to delete it and said -force needed to be used.
  this is not acceptable: a git worktree needs to be removable, no matter what the state of the worktree
* removed another worktree: this appears to delete the entire folder.
  not acceptable: the app did not create the folder, so it should not delete it. user should be asked: delete folder, leave folder but delete files, let everything be.
* I accidentally tried to add an existing folder (existing worktree for another project), which correctly gave an error. but then, when I went to the other project, all worktree folders were gone from the project. the folders however were still existing, with all the content. so I tried to add the folder again, which gave an error 'spawn git ENOENT'
  so it is no longer possible to repair this project. this is also a problem

## Current state

- `WorktreeService.remove` in `desktop/src/git/worktree_service.js:172` runs `git worktree remove <folder>` without `--force`. Git refuses whenever the checkout holds modified or untracked files (`fatal: '<path>' contains modified or untracked files, use --force to delete it`), so a worktree an agent has just written into cannot be removed from Config at all. The raw Git message is surfaced through `dialogService` and the user has no way forward.
- When Git does accept the removal it deletes the checkout folder itself. That is Git's documented behaviour and md2 offers no alternative; `WorktreeRemoveDialog` in `app/src/components/config/worktree_remove_dialog.tsx` only announces it. md2 did not create that folder in every case, so it must not be the only outcome.
- `WorktreeService.add` at `desktop/src/git/worktree_service.js:159` passes the picked folder straight to `git worktree add`. The picker in `openWorktreeFolder` (`desktop/main.js:177`) accepts any existing directory, and there is no emptiness or foreign-worktree precheck, so the failure only surfaces as a raw Git fatal after the user pressed Save.
- `readWorktreeRecords` (`desktop/src/git/worktree_service.js:764`) computes `worktreeError(worktree)` but then calls `this.parkingBranch(resolvedPath)` unconditionally, for every entry, before that error is consulted. `parkingBranch` runs `git rev-parse --git-dir` with the worktree folder as the process working directory.
- A worktree folder that no longer exists on disk stays in `git worktree list --porcelain`, flagged `prunable gitdir file points to non-existent location`. Node's `execFile`, used by `GitProcess.run` in `desktop/src/git/git_process.js:62`, rejects with `spawn git ENOENT` when the `cwd` it is given does not exist. The message names the executable, but the missing thing is the working directory. This is the reported `spawn git ENOENT`.
- Because `readWorktreeRecords` uses `Promise.all`, that one rejection discards the records of every healthy worktree too. `performRefresh` and `refreshAfterMutation` catch it and call `publish(message)` while `this.records` is left at the `[]` that `startProject` assigned, and `WorktreeConfigList` renders `draft?.records ?? []`. The whole list therefore disappears when the project is opened, and every later mutation ends in the same failing refresh, so the project cannot be repaired from the UI.
- Nothing in `desktop/src` or `app/src` ever runs `git worktree prune`, so no code path clears a stale registration.
- Adding a folder that is another repository's worktree fails cleanly (`fatal: '<path>' already exists`) and leaves both repositories intact, confirmed against Git directly. The reported damage to the second project is the `spawn git ENOENT` chain above, not the rejected add.

## Implementation details

- Define **removal mode** as the disposition of the checkout folder when a linked worktree is removed from Git. Three modes, all of which unregister the worktree from Git:
  - `folder` removes the registration and deletes the checkout folder, the current behaviour.
  - `files` removes the registration and deletes the folder's contents, then recreates the folder empty.
  - `unregister` removes the registration only; the folder and every file in it stay.
- Extend `WorktreeService.remove(project, folderPath, mode)` in `desktop/src/git/worktree_service.js` with the mode. Removal must never fail because of worktree content:
  - `folder` runs `git worktree remove --force --force <folder>`. The doubled flag is what Git requires to remove a locked worktree; a single `--force` only covers modified and untracked files.
  - `files` runs the same command, then recreates the now-deleted folder as an empty directory.
  - `unregister` resolves the worktree's administrative directory with `git rev-parse --git-dir` run inside the folder, deletes that directory, deletes the folder's own `.git` link file, then runs `git worktree prune` in the primary repository. The link file has to go: it points at a registration that no longer exists, and leaving it turns the folder into a worktree that both Git and md2 reject. Nothing else in the folder is touched. This sequence was verified against Git; the primary repository stays healthy and the branch survives.
- A record whose folder is missing has nothing left to preserve. When the target record is prunable or its folder does not exist, removal runs `git worktree prune` in the primary repository regardless of the requested mode.
- The branch keeps surviving removal in all three modes, exactly as today.
- Fix the refresh poisoning in `readWorktreeRecords`: skip `parkingBranch` whenever `worktreeError(worktree)` is non-null, and set `parkingBranch` to `null` on those records. A worktree Git already reports as locked, prunable or detached must not have Git commands run inside it. Handle each record independently so one broken worktree cannot discard the others: on a per-record failure, emit an invalid record carrying that failure as its `error` instead of rejecting the whole list.
- `runGit` in `desktop/src/git/git_commands.js` must translate the misleading `ENOENT` rejection into a message naming the working directory, so a missing folder reads as a missing folder and not as a missing Git installation.
- Broken records stay visible. `WorktreeConfigRow` already renders an invalid record in its error state with the Git reason in the tooltip; its remove button must stay enabled so the stale entry can be pruned.
- `WorktreeRemoveDialog` presents the three modes as a radio group, defaulting to `folder`, each option stating its disk outcome. When the target record is invalid or its folder is missing, hide the selector and state that only the stale Git registration will be removed.
- Carry the mode through the draft. `WorktreeDraft.removals` in `app/src/services/project/worktree_service.ts` becomes a list of `{ path, mode }` rather than a list of paths; `stageDraftRemoval(folderPath, mode)` records it and `applyDraft` passes it to `storage.removeWorktree`. Every place that currently tests `draft.removals.includes(path)`, in `WorktreeConfigList` and in `stageDraftRemoval` itself, compares on the path field instead.
- Widen `removeWorktree(project, folderPath, mode)` across the chain: `StorageService` and `ElectronDataBridge` in `app/src/data`, `LocalGitStorageService`, `RemoteControlStorageService`, `desktop/src/shell/preload.js`, and `desktop/src/shell/local_bridge_dispatch.js:307`. Reject an unknown mode at the desktop boundary.
- Give `add` a precheck before `git worktree add`: if the picked folder exists and is not empty, fail with a message naming the folder and the reason instead of letting the raw Git fatal escape. A folder that already holds another repository's worktree is one case of this.
- Tests to update: `desktop/src/git/worktree_service.test.js` for the three removal modes, forced removal of a dirty worktree, pruning a missing folder, and per-record isolation in `readWorktreeRecords`; `app/src/services/project/worktree_service.node.test.ts` for draft removals carrying a mode; the `worktree_config_list` and remove-dialog tests for mode selection and for removing an invalid record; the storage adapter and preload dispatch tests for the widened signature.

## Acceptance criteria

- Removing a linked worktree whose checkout holds modified, untracked or locked content succeeds. No removal reports that `--force` is needed.
- The remove confirmation offers three outcomes, delete the folder, empty the folder but keep it, or keep folder and files, and states for each what remains on disk. `folder` is preselected.
- After `files` the folder exists and is empty. After `unregister` the folder and every file the user or an agent wrote are still there, the folder is no longer a Git worktree, and it holds no dangling `.git` link file.
- In all three modes the worktree is gone from `git worktree list` and its branch still exists.
- A project with one worktree folder missing from disk opens with all remaining worktrees listed. The missing one appears as a single invalid row carrying Git's reason.
- Removing that invalid row prunes the stale registration and leaves a clean list, without any manual Git work.
- No Git command is run with a worktree folder as working directory once Git has reported that worktree as locked, prunable or detached.
- A failure inside one worktree never empties or replaces the records of the others.
- Any error caused by a missing working directory names that directory; `spawn git ENOENT` is never shown to the user.
- Adding a folder that already contains files is rejected before Save with a message naming the folder, and both the target project and any other repository owning that folder are left unchanged.
