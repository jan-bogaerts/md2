---
internalId: 18fd04d3-5df7-4f54-ab7a-94d96f210f13
id: F_87
status: new
title: Block release when cards have assigned worktrees
after: f0fad88a-ea00-41be-aaf9-8f28a4cbdc31
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
