---
author: 
id: B_148
internalId: 70a705b9-4e44-4487-8ac9-48722ba0ef92
title: Codex file change counts omit added and deleted files
status: ready for implementation
owner: 
affects:
agents:
policy:
---

Codex `fileChange` events sometimes reach conversations without `insertions` or `deletions`. Mixed events can also contain counts that cover updated files but omit added or deleted files. `ActionUsageSummary` then undercounts `changes` or hides the control when no event in scope retains counts.

## Current state

`normalizeCodexEvent` calculates completed file-change usage by passing every `change.diff` to `countUnifiedDiffLines`. That parser accepts only unified diffs containing complete `@@` hunks.

The current Codex app-server contract uses an object-shaped change kind:

* Updated file: `kind: { type: "update" }`; `diff` is a unified diff.
* Added file: `kind: { type: "add" }`; `diff` is the complete new file content.
* Deleted file: `kind: { type: "delete" }`; `diff` is the removed file content.

Added and deleted file content has no unified-diff hunk header, so `countUnifiedDiffLines` returns `null`. A mixed event counts only updated files. An add-only or delete-only event has no countable diff, so normalization omits both count fields and `conversationFileChangeUsage` skips the completed event.

`fileChangeContent` also expects `change.kind` to be a string. The object-shaped kind makes persisted file-change content blank even when paths and changes are present.

Verified persisted examples:

* One operation added a 126-line file and updated another file by 15 lines. Stored usage was `+15 / -0` instead of `+141 / -0`.
* One operation added three files totaling 203 lines. Its completed `fileChange` entry stored no insertion or deletion counts.

The completed Codex thread items retain the full change data. Counts are lost during local event normalization, not during bridge transmission, renderer state updates, conversation persistence, or popup aggregation.

## Implementation details

* Interpret the real Codex `FileUpdateChange.kind` object at the provider-normalization boundary.
* Count an added file's content lines as insertions and zero deletions.
* Count a deleted file's content lines as deletions and zero insertions.
* Continue parsing updated files as unified diffs; replacements count as one deletion plus one insertion.
* Sum added, deleted, and updated files within the same completed event. Do not discard valid files because another change has a different kind.
* Render readable file-change content from `change.path` and `change.kind.type`.
* Normalize supported Codex file-change type spellings to canonical `fileChange` before creating conversation entries. Keep the usage aggregator on the canonical conversation type.
* Keep incomplete events excluded until completion. Do not count command executions, MCP tools, or dynamic tools.
* Keep provider-patch `changes` separate from captured Git commit `lines`.
* Replace synthetic tests that use string-shaped kinds or unified diffs for added files with fixtures matching the generated Codex app-server contract.

## Test plan

* Add focused `agent_codex_event` tests for added, deleted, updated, mixed, empty-file, trailing-newline, and multi-file changes.
* Add streaming-adapter coverage proving completed real-shape `fileChange` items transmit insertion and deletion counts.
* Add a regression case matching the verified 126-line addition plus 15-line update; expected result is `+141 / -0`.
* Keep focused conversation persistence and usage aggregation tests proving count fields survive transport and reload.

## Acceptance criteria

* A completed added-file change stores every added content line as an insertion.
* A completed deleted-file change stores every removed content line as a deletion.
* A mixed add/update/delete event stores the sum of all three kinds.
* The verified 126-line addition plus 15-line update reports `+141 / -0`, not `+15 / -0`.
* The verified three-file addition reports `+203 / -0` instead of omitting counts.
* Persisted file-change entries include readable paths and change kinds.
* Supported Codex file-change type spellings produce canonical `fileChange` conversation entries.
* Existing updated-file counting, scope aggregation, compact display, Git commit line totals, and provider-independent activity behavior remain unchanged.
* Focused desktop normalization/adapter tests and app usage-summary tests pass.
