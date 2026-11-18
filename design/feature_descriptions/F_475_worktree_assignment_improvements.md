---
author: 
id: F_475
internalId: 20a597ec-9ca8-4ae1-a47e-a8c2d7279fbf
title: worktree assignment improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__20a597ec-9ca8-4ae1-a47e-a8c2d7279fbf.json
policy:
after: c8fdbf7f-e685-4590-8532-4103d2d68287
---
Assigning a card to a worktree (using the button on the card), can take a little bit of time. enough for the user to wonder if anything is happening. I am not certain why this is exactly, so I took a performance trace of both desktop and renderer:

This is the performance trace of the desktop app: [CPU-assignworktree.cpuprofile](file:///C:/Users/janbo/Documents/dev/CPU-assignworktree.cpuprofile)

this is the performance trace of the renderer: [Trace-assign worktree.json](file:///C:/Users/janbo/Documents/dev/Trace-assign%20worktree.json)

In this run, it is already faster cause I had already assigned the card previously to the same worktree, so the branch probably already existed and the worktree had the correct code loaded.

So lets first analyze what exactly is done when user assigns and then the second operation, updates the worktree. Are there any places where we could improve.

secondly, we will need to show some feedback to the user that the operation is in progress. maybe by a spinning border? we already have something similar for the 'run' button.

## Current state

`WorktreeSelector` awaits `WorktreeService` for assignment and update. `WorktreeService` marks the card as preparing, which disables the selector, but the closed menu leaves only a static disabled button. User gets no clear progress signal.

Assignment calls desktop `WorktreeService.prepare`. It lists and inspects every linked worktree, validates the selected worktree twice, checks or creates the card branch, switches the checkout, then refreshes primary and every linked worktree again. Desktop profile covers 24.9 seconds: 94.3% is idle waiting and child-process spawn is the largest active sample. Delay therefore comes mainly from waiting on many Git subprocesses, not desktop JavaScript computation.

Update first flushes pending app saves, then repeats repository-wide discovery and duplicate selected-worktree validation before checkpointing primary changes, rebasing, and refreshing every worktree. A checkpoint is an automatic local commit of pending primary-worktree changes. Renderer trace also contains React tasks up to 231 ms; broad worktree `changed` events currently wake every selector subscription when one card starts or finishes an operation.

## implementation details

- Keep branch naming, reservation checks, repository-identity checks, clean-worktree checks, pending-save flush, primary checkpoint, rebase/conflict handling, persistence, and error behavior unchanged.
- In desktop assignment and update, start from the selected cached branch record, verify repository identity, branch, and status once, then operate on that record. Do not list or inspect unrelated worktrees before the operation. Leave shared `requireClean` behavior unchanged for its other callers.
- After assignment switches or creates the card branch, refresh only that linked-worktree record. Do not use repository-wide `refreshAfterMutation` for this path.
- Make primary checkpoint creation report whether it changed project `HEAD`. After update, refresh only selected record when `HEAD` stayed unchanged. When a checkpoint changed `HEAD`, refresh primary and all linked records because every `baseAhead` and `baseBehind` value uses that commit as comparison base.
- Key card-operation state and its scoped event by `cardInternalId`; keep card path only as persistence and operation input. `useWorktreeSelectorState` subscribes to that card's event, so another card starting or finishing work does not wake this selector.
- While assignment or update is pending, disable selector and show same theme-based rotating conic border used by Run button. Accessible name states `Worktree operation in progress`. Start indicator before first awaited save or Git call; clear it in `finally` after success or failure.
- Add desktop command-sequence tests for assignment and update with unrelated linked worktrees, existing/new card branches, clean/dirty state, checkpoint/no-checkpoint paths, and rebase conflict. Add app service and component tests for scoped notifications, spinner lifetime, disabled state, accessible name, success, and failure.

## acceptance criteria

- Assigning card shows spinning worktree-button border from operation start until assignment is applied to card model or failure is reported; selector cannot start second operation meanwhile.
- Updating worktree shows same feedback through pending-save flush, Git update, and final state publication.
- Assignment and update inspect selected worktree once before mutation. Git command count does not grow with unrelated linked-worktree count unless update creates primary checkpoint and must recalculate comparison status for all worktrees.
- Successful assignment still reuses or creates correct card branch and persists worktree index plus branch. Failure leaves prior assignment intact and clears progress state.
- Update still flushes pending saves, checkpoints dirty primary state, handles rebase conflicts, and publishes correct primary and linked-worktree status.
- Starting or finishing operation for one card does not notify or rerender another card's selector.
- Focused app and desktop tests plus each subproject's lint pass.
