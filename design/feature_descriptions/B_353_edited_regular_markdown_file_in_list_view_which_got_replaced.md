---
author: 
id: B_353
internalId: 0f515f9c-2043-46a5-87e1-547488b1a772
title: edited regular markdown file in list view which got replaced
status: ready
owner: 
affects:
agents:
  - design/activity/card__0f515f9c-2043-46a5-87e1-547488b1a772.json
policy:
branch: b_353_edited_regular_markdown_file_in_list_view_which_got_replaced
worktree: 2
changedFiles:
  - app/src/components/editor/history/markdown_document_history_cell.ts
  - app/src/components/editor/history/markdown_document_history_monitor.tsx
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor_reliability.real.test.tsx
  - app/src/components/editor/markdown_reliability_data_source_fixture.ts
  - app/src/components/editor/source/markdown_source_controller.ts
  - app/src/data/commit_batcher.test.ts
  - app/src/data/commit_batcher.ts
  - app/src/services/open_files_service.node.test.ts
---

I think there is a serious bug in the system regarding the editing and saving of regular markdown files.

I opened the markdown file through the link on a conversation on an action popup. then changed some things to the file. I think i clicked on it again from within the action popup, closed it, opened some other markdown files, including the card that triggered the generation of the markdown file I edited.

In the ui everything looked ok, but the agent reported it could no longer find the file.

I closed and reopened the project and now the file was gone, but we had 2 duplicates of the card file. so something went seriously wrong her. perhaps in the save or commit process of the markdown editor in listview

## Current state

Regular Markdown files and cards use the same lifetime-stable `CardEditor`. The editor stores the active target separately from the Markdown editor instance. During a document switch, it flushes the outgoing content, changes the active target, and then replaces the editor content.

The programmatic replacement can still produce editor change callbacks after the active target changed. `handleEditorChange` applies every callback to the current target, not the target that initiated the change. Rapid reopen, close, and document switches can therefore apply one document's content to another document. The normal save pipeline then persists the corrupted in-memory document at its target path.

Existing tests cover ordinary switching and saving, but not delayed rich-editor callbacks across the reported open-edit-reopen-close-switch sequence.

## implementation details

* Make a list-editor document switch one transaction. Flush the outgoing target before starting the replacement and do not activate the incoming target until its expected Markdown is established as the editor baseline.
* Ignore programmatic and stale editor change callbacks while a replacement is pending. A callback may update a draft only when it belongs to the active document generation.
* Preserve the current document-specific history behavior and clear the pending switch state after success, discard, or failure.
* Reject a persistence batch containing multiple writes or moves to the same target path. Report the conflict instead of relying on write order.
* Add real `MDXEditor` regression coverage for regular Markdown and card documents. Exercise repeated link activation, editing, closing, reopening, and switching in the reported order, including a callback arriving after a switch.

## acceptance criteria

* Editing a regular Markdown file and then opening or closing other Markdown files never changes another document's draft or persisted content.
* Reopening the same file through a conversation link does not duplicate its tab, reset its pending edit, or redirect later changes to another document.
* Every editor callback is ignored or applied to the document generation that owns it; stale callbacks cannot modify the current document.
* Closing or switching away from a dirty document persists its latest content exactly once at its own path.
* Persistence fails visibly before writing when a batch contains the same target path more than once.
* Reopening the project shows the same files and contents that were visible after the last successful save, without missing files or duplicate cards.
