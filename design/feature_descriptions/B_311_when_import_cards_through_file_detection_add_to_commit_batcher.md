---
author: 
id: B_311
internalId: b6bfdd41-b224-4656-8ba0-12c841e72bac
title: when import cards through file detection add to commit batcher
status: ready
owner: 
affects:
agents:
  - design/activity/card__b6bfdd41-b224-4656-8ba0-12c841e72bac.json
policy:
after: 349bbb7d-ab48-4ef5-85df-3f6caf2fd460
branch: b_311_when_import_cards_through_file_detection_add_to_commit_batcher
worktree: 1
changedFiles:
  - app/src/data/commit_batcher.test.ts
  - app/src/data/commit_batcher.ts
  - app/src/services/data/card_internal_id_operations.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/external_card_import_service.node.test.ts
  - app/src/services/data/external_card_import_service.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_loading.ts
---

## Problem

The desktop watcher detects Markdown files created by external tools, including agents, and reloads them into application state. Persistence then depends on the filename:

- A non-conforming filename is treated as an external import. MD² completes its header, renames it, and commits it immediately through `StorageService.moveFiles`.
- A conforming filename is treated as an existing card. MD² adds it to the UI but does not schedule it for persistence. `ensureCardInternalIds` only schedules a change when the card lacks an `internalId`.

The filename check was introduced for import idempotency: after `notes.md` becomes `F_123_notes.md`, later project loads must not import and rename it again. It incorrectly conflates two decisions:

- whether the file needs normalization;
- whether a newly detected file needs to be committed.

Agents can create valid card files directly. Such a file needs no normalization, but it is still a new repository change. If it already has an `internalId`, it remains uncommitted and is not represented in `CommitBatcher` or the pending-save state.

The non-conforming path also bypasses `CommitBatcher`, so imports cannot join the normal pending batch and do not use its retry and save-state behavior.

## Required behavior

When the watcher detects a previously unknown card file in the working folder:

- Add the card to application state immediately.
- Preserve the existing idempotency rule: do not rename or regenerate fields for a complete, conforming card.
- Queue the repository change in `CommitBatcher`, regardless of whether normalization is required.
- Let the normal batch flush, push, retry, and pending-save flows own persistence.
- Do not automatically queue ordinary external edits to cards that were already known.

## Implementation direction

Separate detection, normalization, and persistence scheduling.

- For a new conforming card, schedule a commit-only path entry. The file on disk is authoritative, so the batch must stage its latest content at flush time instead of writing a renderer snapshot over possible later agent output.
- For a new non-conforming card, create the normalized card in service-owned state and schedule one card path change from the detected source path to the generated target path. Use `Card.header.internalId` as the pending card identity.
- Remove the direct `StorageService.moveFiles` commit and direct push handling from the watcher import flow.
- Ensure later watcher events for a pending commit-only external card refresh application state and keep the same path queued. They must not be reported as conflicts merely because that path is awaiting commit.
- Keep watcher echoes produced by the eventual batch write classified as local persistence echoes.

## Edge cases

- Repeated watcher events for one new path must produce one pending entry.
- Multiple new files detected together must join the same commit batch.
- A conforming card with a complete header must remain byte-for-byte unchanged.
- A non-conforming card must receive one id and one target path, even when watcher reloads overlap.
- Project or branch changes must flush the pending import through the existing persistence workflow.
- A failed batch flush must retain the pending import for retry and keep the save state dirty.

## Tests

- A watcher-detected conforming card with an `internalId` is added to the UI and queued as a commit-only path.
- A later disk update to that pending card is loaded and the flush commits the latest disk content.
- A watcher-detected non-conforming file is normalized and queued as a card path change rather than committed through `moveFiles`.
- Repeated watcher events do not duplicate either kind of pending change.
- Conforming and non-conforming files detected together are committed in one batch.
- A failed flush leaves the changes pending for retry.
