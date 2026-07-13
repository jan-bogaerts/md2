---
id: B-063
title: action editor delivery mixes unrelated feature changes
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Commit `6918ff9` (`edit actions`) changes 123 files and mixes action-editor work with config Markdown UI, remote-control feature descriptions, worktree behavior, theme/tests, search, scheduling, and other unrelated changes. Required dependencies and unrelated work cannot be reviewed or reverted independently, increasing regression risk.

This card does not request rewriting published Git history.

## Fix

- Inventory every file changed by `6918ff9` against the action-editor dependency graph.
- Classify each change as required action-editor work, independently intended work with its own card, or accidental/unverified scope.
- For independently intended work, ensure a matching feature/bug card describes behavior and tests.
- Revert accidental behavior through normal follow-up commits; do not use `git reset --hard`, force-push, or history rewriting.
- Run focused regression checks for config, remote control, worktrees, search, scheduling, action execution, and text view because those domains changed together.
- Future implementation commits must contain one feature/fix plus verified direct dependencies. Mention unavoidable cross-domain dependencies in commit/PR description.

## Edge cases

- A file contains both required and unrelated hunks; split follow-up changes at hunk/behavior level.
- Documentation moves may be intentional but leave stale links.
- Existing unrelated user changes must not be reverted merely because they share the commit.
- A failing test may expose pre-existing behavior; follow repository test-conflict rules before changing code.

## acceptance criteria

- Every non-action-editor behavior in `6918ff9` is tied to an explicit card or reverted through a reviewed follow-up.
- No user-owned or intentional change is discarded without verification.
- A scope inventory is recorded in the PR/card discussion or a short implementation note.
- Affected app and desktop lint, typecheck, and tests pass after cleanup.
- Subsequent action-editor fixes are reviewable as focused commits.

## see also

- `design\actions\implement_feature.md`
- `design\actions\review_implementation.md`
- [[B-050]]
