---
id: J-019
title: unify open-document drafts and file save state
status: ready
owner: JB
affects:
  - app/src/services/open_files_service.ts
  - app/src/services/open_files_service.test.ts
  - app/src/data/commit_batcher.ts
  - app/src/data/commit_batcher.test.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/card_operations.ts
  - app/src/services/actions/action_service.ts
  - app/src/services/project/project_persistence_service.ts
  - app/src/components/editor/markdown_data_source.ts
  - app/src/components/editor/card_markdown_data_source.ts
  - app/src/components/editor/action_markdown_data_source.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor_state_store.ts
  - app/src/components/editor/markdown_document_history_store.ts
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/card_view/card_body_save_status.tsx
  - app/src/components/text_view/card_editor.tsx
  - app/src/components/actions/list_action_editor.tsx
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Make one canonical `OpenDocument` own each open file's in-memory draft and dirty state. List and board views use the same object, so content, save state, renewal, and events cannot diverge. Dirty means the complete JSON or Markdown file still needs successful persistence; prompt, phrase, body, and editor-instance dirty flags do not exist.

## Current problems

- `MarkdownEditorStateStore` tracks one editor buffer while `ActionService` revisions and `CommitBatcher` separately track the same file through later save stages.
- Markdown data sources discard `OpenDocument` identity, retain string IDs, and resolve domain objects again.
- Board and list card editors can hold different local buffers for the same card.
- `ActionService.savedRevision` advances when `DataService.persistActionFile()` schedules a batch, before `storage.commit()` succeeds.
- `CardBodySaveStatus` hides the split by combining editor dirty state with `CommitBatcher` state.

## Design

### Canonical open documents

`OpenFilesService` owns a registry keyed by stable card/action identity plus two membership sets:

- list-view documents;
- board-view documents.

Both sets reference the same canonical `OpenDocument`. Opening an already registered card in another view reuses it and does not open or activate a list tab. Closing one view removes only that membership. A document remains registered while either view owns it or while it has unsaved/recoverable state; close and project-switch flows must flush, discard, or retain that state explicitly.

Each document is a stable `EventTarget` exposing its current full domain object, current draft, file-level dirty state, and private edit/save revisions. Domain renewal updates the stable object. Draft, dirty, saved, and renewal transitions emit document events; consumers read document properties directly. Do not add a `getSnapshot()` method for a boolean.

### Shared drafts

Every edit updates the active `OpenDocument` draft and marks the whole file dirty. Data sources receive and retain full documents, never reconstruct ownership from paths or compound IDs. Both card editors read the same draft and subscribe to the same document. An edit from one binding updates the other binding; origin metadata prevents the originating editor from replacing its own state or losing cursor/history.

`MarkdownEditor` reports edits through the active document/data source but never declares a persisted document clean. Local transient editors without an `OpenDocument` may keep `onDirtyChange`; they are outside project-file save state.

### Action sections

An action is one `ActionOpenDocument` and one dirty file. Prompt and phrases are editor sections only:

```ts
type ActionMarkdownSection =
    | { kind: 'prompt' }
    | { kind: 'phrase'; identity: string }
```

The active target pairs the canonical action document with its section. Section identity routes outgoing text, external replacement, undo history, and phrase deletion. It never owns dirty state and is not encoded as a public namespaced `markdownDocumentId`. Card body uses one implicit `body` section.

History and echo suppression key by canonical document plus section. History remains binding-owned. Closing a document discards its histories; deleting a phrase discards only that section.

### Save ownership

`OpenDocument.dirty` is authoritative for whether an open file needs saving:

1. A document mutation increments its private edit revision and marks it dirty.
2. Scheduling persistence captures document and revision with the complete serialized file.
3. `CommitBatcher` keeps operational pending/in-flight entries per file.
4. Only successful `storage.commit()` acknowledges the captured revision on the document.
5. A failed commit leaves it dirty. Completion of an older revision cannot clear newer edits.

Invalid action drafts remain dirty even when they cannot yet be scheduled. When repaired, the complete current action is serialized and queued. `ActionService` may retain draft, validation, conflict, and queue revisions, but its saved revision must represent successful batch persistence, not handoff to `CommitBatcher`.

Path changes carry the same document and revision through the batch. Successful rename renews the document path without replacing document identity.

`ProjectPersistenceService` remains the aggregate coordinator. It derives pending-save state from dirty/recoverable documents, pending or in-flight commit batches, and active storage operations. `hasPendingPush` remains separate Git state. Files changed without an open document, such as board ordering or bulk operations, continue to be represented by `CommitBatcher` entries.

### Removal

Remove `MarkdownEditorStateStore`, its props, instances, subscriptions, and tests. `CardBodySaveStatus` subscribes to the canonical card document and reads its file-level dirty state; it no longer combines two dirty sources. Rename generic per-file batch queries such as `hasPendingActionFile` where they remain needed for conflict handling.

## Failure and lifecycle rules

- Switching section, tab, view, project, branch, or closing the app flushes editor drafts into persistence before flushing batches.
- A failed flush or storage commit keeps the document and global persistence state dirty and retryable.
- External content change against a clean document renews its draft; against a dirty document it follows existing conflict/recovery behavior and never silently replaces local content.
- Simultaneous board/list editing uses one draft. Non-origin editors synchronize without writing an echo back.
- Closing the last view of an invalid or conflicted action must not lose its recoverable draft.
- Reopening a fully saved, released document creates a fresh wrapper and fresh history.

## Implementation scope

- Replace ID-only Markdown binding snapshots/events with full document plus optional section targets.
- Update Markdown editor and history monitor switching to retain the exact outgoing target during flush.
- Make card/action data sources operate on document drafts and current document paths.
- Add canonical registry and list/board membership APIs to `OpenFilesService`.
- Add document/revision metadata and successful-save callbacks to `CommitBatcher` entries, including normal writes and renames.
- Align action draft save acknowledgement and project persistence aggregation with batch completion.
- Update board/list components, active-card hooks, toolbar/diff consumers, cleanup handlers, and save status to use full documents.
- Delete compound action Markdown document ownership helpers when no remaining internal history migration requires them.

## Acceptance criteria

- Board and list views of one card receive the same `CardOpenDocument`, draft content, dirty state, and events.
- Editing any card body, action field, prompt, or phrase marks exactly one file-level document dirty.
- Successful physical batch persistence clears only the saved revision; failures and newer edits remain dirty.
- Action prompt/phrase switching always writes the outgoing section, while the action stays one dirty document.
- Invalid/conflicted actions remain recoverable and dirty without a queued batch.
- Project save indicators, flush guards, project/branch switching, and app close observe all dirty documents and pending batches.
- No `MarkdownEditorStateStore`, editor-specific persisted dirty flag, public compound `markdownDocumentId`, or false pre-persistence `savedRevision` remains.
- Tests cover shared board/list editing, section routing, renewal/rename, close/reopen, invalid actions, external conflicts, failed saves, and edits arriving during an in-flight save.
- App lint and tests pass.

## See also

- [[J-017]]
- [[J-018]]
- [[B-052]]
- [[B-068]]
- [[B-071]]
