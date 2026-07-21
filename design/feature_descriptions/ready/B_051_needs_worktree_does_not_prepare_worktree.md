---
id: B-051
title: needsWorkTree must use a configured card assignment
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

`needsWorkTree` execution must use a folder from Git's current linked-worktree list selected by the card's one-based worktree assignment. Action execution must not create, remove, or assign worktrees.

The current service resolves assigned card worktrees, but the contract and errors must be consistent across manual, linked, state-triggered, and scheduled runs.

## Fix

- Resolve the card's worktree index against Git's current linked-worktree list before process start.
- Reject an unassigned card, invalid index, invalid/unavailable folder, or non-card context with the exact validation error.
- Apply worktree resolution independently to every linked action through the unified Electron runner.
- Do not commit, push, merge, cherry-pick, or transfer changes implicitly.
- Keep repository locking around execution and ensure lock release on every failure.

## Edge cases

- Existing assignment points to a missing/invalid worktree.
- Card has no worktree assignment.
- A file or folder context requests an action that needs a worktree.
- Linked action switches between primary project and dedicated worktree.

## acceptance criteria

- Assigned cards run in their assigned worktree.
- Unassigned cards and file/folder contexts are rejected before process start.
- Missing, invalid, and unavailable linked worktrees report actionable errors.
- Execution creates, removes, and assigns no worktree.
- No implicit integration operation occurs.
- Tests cover assigned, unassigned, non-card, invalid configured entries, cancellation, repository locking, and linked actions.

## see also

- [[F-010]]
- `design\feature_descriptions\F-10-git-worktrees.md`
- `design\architecture\initial description\writings\running_actions.md`
