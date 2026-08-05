---
author: JB
id: F_143
internalId: 972b0cb8-3d8a-4935-9197-17ca3ad037ec
title: make parsed card the canonical in-memory object
status: ready for implementation
owner:
affects:
  - app/src/services/data/card_operation_context.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/data/card_rename_operations.ts
  - app/src/services/data/card_archive_operations.ts
  - app/src/services/data/markdown_parsing_service.ts
  - app/src/services/data/data_service.ts
  - app/src/services/open_files_service.ts
  - app/src/data/commit_batcher.ts
  - app/src/data/data_types.ts
agents:
policy:
after: 299444fe-cb8b-420f-a89d-3c3300bf249e
---

## Problem

The renderer keeps three overlapping in-memory representations of the same card and continuously reconciles them:

1. the raw markdown **file content string** in the loaded `files()` array — the current canonical form for writes;
2. the **parsed card** in the project snapshot (`ProjectCard`), rebuilt from the strings after every change;
3. the **open editor draft** (`CardOpenDocument`), holding unsaved body text separately from both.

Because the string is canonical, every field change is a parse/rewrite of markdown text (`rewriteHeader`, `setWorktree`, `setPolicyFlag`, `replaceBody`), and every metadata write must first splice the unsaved editor body back into the string (`mergeOpenCardBody`) so it does not drop local edits. After each write the snapshot is re-parsed from all strings, and the open document must be re-pointed at the rebuilt card (`resyncOpenCardDocument`, save references). This merge/resync code is the most fragile part of the data layer and the source of repeated bugs around lost drafts, stale snapshots, and save acknowledgement.

## Current state

- `files()` holds `MarkdownFile { path, content, sha }`; all card operations rewrite `content` via `markdownParsingService` string transforms.
- The snapshot (`ProjectSnapshot`) is derived from the strings on every change (`refreshSnapshot`) and indexed per instance for lookups.
- `CardOpenDocument` keeps its own draft of the body; `mergeOpenCardBody` and `attachSaveReference`/`acknowledge` keep it consistent with metadata writes and batched commits.
- `CommitBatcher` receives fully serialized `MarkdownFile`s and flushes them as one git commit; disk writes stream the string as-is.
- The file watcher plus `commitPathsInFlight` reconcile external (agent, git, editor) changes back into the strings.

## Requested changes

1. Introduce one canonical mutable card model per loaded card (header fields, policy flags, ordering, worktree, body) owned by the data service. All card operations mutate this object directly instead of rewriting markdown text.
2. Serialize the card model to markdown only at persistence boundaries: when the commit batcher flushes, and wherever raw content is genuinely required (diffs, export, external tools). Serialization must be deterministic and round-trip stable with the parser.
3. Derive the project snapshot from the canonical models without re-parsing markdown strings on every change.
4. Make the open editor draft a view on the canonical model's body rather than a parallel copy:
   - typing updates the model's body (or a body draft owned by the model);
   - metadata writes no longer need `mergeOpenCardBody`;
   - `resyncOpenCardDocument` and the save-reference re-pointing dance are removed or reduced to commit acknowledgement only.
5. Keep the commit batcher's contract (debounce, coalescing per path, one commit per flush, save acknowledgement) but feed it card references; it serializes at flush time so multiple field changes to one card serialize once.
6. Keep the external-change path: when the watcher reports an out-of-band change to a card file, re-parse that file into a fresh canonical model and replace it, using the existing in-flight echo suppression. Conflict policy for a card with unsaved local changes must match today's behavior.
7. Non-card project files (plain markdown, JSON, assets) may remain string-based; only cards get the canonical model.

## Edge cases

- A metadata change (state, worktree, policy) while the card body is open and dirty in the editor: the flushed markdown must contain both the metadata change and the unsaved body.
- Several field changes to the same card within one debounce window must serialize once and produce one commit entry.
- A rename/move changes the path while changes to the same card are pending in the batcher.
- An external (agent) edit arrives for a card that has pending unflushed local changes.
- A card whose markdown contains constructs the parser preserves but does not model (unknown header keys, comments, formatting) must survive a load → change one field → serialize round trip without corrupting or dropping them.
- Undo/redo in the editor keeps working against the model-backed draft.

## Acceptance criteria

- No card operation rewrites markdown text to change a field; header/string transforms in `markdown_parsing_service` are used only at parse and serialize boundaries.
- `mergeOpenCardBody` is gone; a metadata write with a dirty open editor loses no edits.
- Parse → serialize round trip is byte-identical for every card in an unchanged project (verified by test across the repository's own design cards).
- One flush per debounce window per card, regardless of how many fields changed.
- Watcher-driven external changes still update the UI, and the app's own writes are still echo-suppressed.
- Existing behavior is unchanged for: commit messages, push modes, save-state indication, diffs, and non-card files.
- Tests cover: round-trip stability, metadata+dirty-body flush, coalesced multi-field changes, rename with pending changes, external change with pending changes, and unknown-header preservation.
