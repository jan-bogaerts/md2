---
internalId: 18fd04d3-5df7-4f54-ab7a-94d96f210f13
id: F_87
status: design
title: Block release when cards have assigned worktrees
after: 903157da-1625-4516-b5c9-b4880ef7fc40
agents:
  - design/activity/card__18fd04d3-5df7-4f54-ab7a-94d96f210f13.json#conversation=agent-1ae20cc4-a8ed-4a3a-916b-8b15465bfaf3
  - design/activity/card__18fd04d3-5df7-4f54-ab7a-94d96f210f13.json#conversation=agent-5109655c-f657-45a6-88bb-b4d86313b0aa
worktree: 3
---

# Block release when cards have assigned worktrees

## Problem

Completing a release currently moves active cards even when they still have an assigned worktree. This leaves stale worktree metadata in released cards.

## Required behavior

Before moving any files, check all active cards for a worktree assignment.

If one or more cards have an assigned worktree:

- Do not complete or push the release.
- Show an error through `dialogService`.
- Include the IDs of all affected cards in the error.

Example: `Cannot complete release. Unassign worktrees from cards: F-1, B-12.`

## Acceptance criteria

- A release proceeds unchanged when no active card has a worktree assigned.
- A release with assigned worktrees moves no files and performs no push.
- The error lists every affected card ID.
- Tests cover release completion with zero, one, and multiple assigned worktrees.
