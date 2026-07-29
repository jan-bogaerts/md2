---
author:
id: F_80
internalId: d1069d03-d709-4ca3-83d1-d574fab57978
title: Custom release and archived folders
status: ready
owner:
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Add project configuration for:

- `releasesFolder`: folder containing one subfolder per completed release.
- `archivedFolder`: folder containing cards moved to status `archived`.

Both folders are relative to `projectFolder`, not `workingFolder`.

## Current state

Release completion moves cards to `<workingFolder>/history/<releaseName>`. This is wrong when `workingFolder` is a subfolder of `projectFolder`. The `history` segment is also hard-coded in release archiving, text-tree special folders, search grouping, and agent-usage grouping. No configured destination exists for individually archived cards.

## Required behavior

- Add both folder fields to `ProjectConfig`, config metadata, validation, persistence, path resolution, and project config UI.
- Resolve both folders under `projectFolder`; reject absolute paths, traversal, empty values, and conflicting configured folder paths.
- Complete releases under `<projectFolder>/<releasesFolder>/<safeReleaseName>`.
- Change `buildReleaseMoves` to receive `projectFolder`, `releasesFolder`, and the validated release name. It must not receive `workingFolder`.
- When an active card changes to status `archived`, move it to `<projectFolder>/<archivedFolder>/` in the same logical commit as its status and ordering updates.
- Preserve card content, relative asset links, push-mode behavior, collision checks, and snapshot refresh behavior.
- Use configured folders for text-tree special-folder handling, background search grouping, and release agent-usage grouping. Remove hard-coded `history` assumptions from these paths.

## Acceptance criteria

- With `projectFolder: design`, `workingFolder: active`, and `releasesFolder: releases`, completing `v1` moves cards to `design/releases/v1/`.
- With `archivedFolder: archived`, changing a card to status `archived` moves it to `design/archived/` and removes it from the active board.
- Custom nested folder values remain inside `projectFolder`.
- Duplicate targets or existing release folders fail before any move.
- Tree, search, card numbering, and agent-usage totals recognize both configured folders.
- Tests cover config validation/resolution, release and archived-card moves, collisions, assets, search grouping, tree grouping, and agent-usage grouping.
