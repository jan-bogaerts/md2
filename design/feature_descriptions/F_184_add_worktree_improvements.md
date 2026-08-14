---
author: 
id: F_184
internalId: bd257fa5-fafa-425b-be61-73a090e1ccf5
title: add worktree improvements
status: ready
owner: 
affects:
agents:
  - design/activity/card__bd257fa5-fafa-425b-be61-73a090e1ccf5.json#conversation=agent-f7330047-51cc-4ab7-b247-8cf20866fb19
  - design/activity/card__bd257fa5-fafa-425b-be61-73a090e1ccf5.json#conversation=agent-acf8208b-10d3-41ad-ba37-eab1506fbc06
policy:
---

## Current state

- Config > Project reads linked worktrees from `git worktree list`; project config stores no worktree paths.
- Add opens the Electron folder picker, then immediately runs `git worktree add` and prepares the parking branch. `WorktreeService.adding` keeps the add-button spinner active for the full Git operation.
- Confirming removal immediately runs `git worktree remove`.
- Config Save handles config values only. Cancel discards config values but cannot undo worktree changes already applied to Git.

## Implementation details

- Define the **worktree draft** as renderer-only state containing folders selected for addition and existing worktrees selected for removal. It is never written to project config.
- `WorktreeService` owns the draft because worktree state must not live in React components. Opening Config initializes the draft from current Git-reported records; closing through Cancel or unmount discards it.
- Split folder selection from Git mutation. Folder selection returns a path or cancellation without calling `git worktree add`. Change `StorageService.addWorktree` and both local and remote-control adapters to accept the selected folder path when Save later applies the draft.
- Add places the selected path in the draft only. Reject the primary worktree path and duplicate existing or pending paths. Picker cancellation leaves the draft unchanged.
- Removing an existing worktree marks it for removal without calling Git. Keep its row visible and mark it as pending removal so one-based Git worktree indices do not appear to change before Save.
- Removing a pending addition deletes that addition from the draft; no Git confirmation or mutation is needed. Confirming removal of an existing worktree must explain that Git removes its checkout folder only after Save and retains its branch.
- Config Save first applies pending removals with non-forced `git worktree remove`, then applies pending additions with `git worktree add` and parking-branch preparation. After all mutations succeed, continue existing config-save behavior and close Config.
- While Save applies worktree changes, keep Config open, disable Add, Remove, Save, and Cancel, and show a labeled spinner with text `Setting up worktrees with Git...`. This prevents edits or cancellation during mutations that Git may already have completed.
- If a Git operation fails, stop remaining operations, keep Config open, report the error through `dialogService`, refresh live Git records, and retain unapplied draft changes. Do not save unrelated config changes. Completed Git operations remain completed; no automatic rollback is attempted.
- Existing `WorktreeService` consumers for card assignment and action execution continue reading only live Git records, never draft entries.
- Update tests for `WorktreeConfigList`, `ConfigPage`, `WorktreeService`, local and remote storage adapters, Electron preload dispatch, and desktop `WorktreeService`. Cover deferred mutations, Cancel, Save progress text, operation order, picker cancellation, and partial failure.

## Acceptance criteria

- Selecting one or more folders changes only the worktree draft; Git creates and prepares no worktree before Save.
- Selecting existing worktrees for removal changes only the draft; Git removes no worktree before Save.
- Cancel or Config dismissal discards all pending additions and removals without changing Git or project config.
- Save applies pending removals, then creates and prepares pending additions through Git.
- Config remains visible during Git work, with `Setting up worktrees with Git...` beside a spinner and all mutation and dialog action controls disabled.
- Successful Git worktree changes finish before existing config values are saved and Config closes.
- Failed Git work keeps Config open, reports the cause, skips remaining operations and config persistence, and shows refreshed Git state plus still-unapplied draft changes.
- Pending additions and removals never appear to card assignment or action execution as usable worktrees.
- Worktree paths remain derived from Git after Save; no separate worktree-path registry is added to project config.
