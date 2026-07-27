---
id: F-024
title: history archiving (complete release)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 51ac84d8-9f76-4c3b-b0bd-e681a7ca19bc
---

## Goal
Implement the "complete release" operation from F-003: move the current active (root working-folder) cards into a new `history/{release}` subfolder and commit the moves, so the board is cleared for the next release while archived cards stay searchable.

## Current state
The `history` folder is recognized for tree display (`DEFAULT_SPECIAL_FOLDERS` in `app/src/data/file_tree.ts`) and search grouping, and id numbering already scans subfolders, but no code moves cards. There is no release UI, no storage-level move/rename operation (`StorageService` has no delete or move), and no commit path for relocating files.

## implementation details
- Add a `moveFiles` (or `completeRelease`) operation to the `StorageService` contract: GitHub implementation writes the file at the new path and deletes the old one (contents API delete with sha); local Git implementation uses `git mv` (or move + add/remove) through the Electron bridge.
- Add `DataService.completeRelease(releaseName)`: flush pending commits, move every active card file to `{workingFolder}/history/{releaseName}/`, commit as a single logical change and push per push mode, then reload/refresh the snapshot so the moved cards become background cards.
- Validate the release name (safe path segment, not already existing) and fail clearly on collisions.
- Add a UI entry point: a "Complete release…" command (toolbar or project menu area) that asks for the release name and shows progress/errors.
- Keep `after` ordering and headers untouched by the move; only paths change. Agent log references that are repo-relative stay valid.
- Id generation must keep considering archived files so ids stay unique (already the case via subfolder scanning; add a regression test).

## acceptance criteria
- Completing a release creates `history/{release}` and moves all active root cards into it in one commit (local) or one coherent batch (GitHub).
- After completion the card board is empty and the archived cards appear under the history folder in the tree and in background search results.
- A duplicate or invalid release name is rejected with a clear error and no partial move.
- New card ids remain unique against archived history cards.
- Manual push mode leaves the release commit unpushed until push is invoked; auto mode pushes it.
- Tests cover the storage move operation (both backends), the DataService orchestration, name validation and snapshot refresh.

## see also
- `design\feature_descriptions\F_003_special_folders.md`
- `design\architecture\initial description\data management.md`
