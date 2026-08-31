---
author: 
id: B_165
internalId: cd2dca75-15df-4f60-b640-8a8a91aba68e
title: card file change drops body
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__cd2dca75-15df-4f60-b640-8a8a91aba68e.json
policy:
branch: b_165_card_file_change_drops_body
---
I was editing a card that already had a body. we changed the title which caused the entire body to disappear. The data doesn't seem to be lost, the card simply drops the body: after closing the card and opening it again, the body is there again. This caveat: nothing in the body was changed, so when the body disappeared, the card was closed and opened again.

we recently did some major refactoring round the file watcher, when cards get reloaded and such. something went wrong, was skipped or brings it now to the surface.

lets investigate the algorithm and see where it is going wrong.

## Current state

Changing a card title through the card UI calls `CardMarkdownDataSource.updateActiveCardTitle`, then `CardRenameOperations.updateCardTitle`. When new title changes filename slug, `CardRenameOperations.renameCard` commits pending edits, updates title and first body heading, commits file move, and calls `reconcileCardPath` (`app/src/services/data/card_rename_operations.ts`). `reconcileCardPath` updates loaded card path and publishes `CARD_PATH_CHANGED_EVENT`.

`CardPopupService.handleCardPathChanged` keeps open card-details entry and changes its `cardPath` (`app/src/services/card_popup_service.ts`). Card still has same `internalId`; `OpenFilesService` therefore keeps same logical card document and renews its path (`app/src/services/open_files_service.ts`).

`CardBodyPopoverEntry` nevertheless binds board document in effect depending on both `cardIdentity` and `cardPath` (`app/src/components/card_view/card_body_popover.tsx`). Path change runs effect cleanup. Cleanup calls `dataSource.setBoardDocument(null)` before closing old board document. Null target means no card document is bound. `MarkdownDocumentHistoryMonitor` handles this `activeDocumentChanged` event by switching editor Markdown to empty string (`app/src/components/editor/markdown_document_history_monitor.tsx`, `app/src/components/editor/markdown_document_history_store.ts`). This clears visible body even though owned card and persisted file still contain it. Closing and reopening popup creates fresh binding from owned card, so body returns.

## Implementation details

* Bind card-details editor lifetime to stable card `internalId`, not mutable file path. Title-driven path rename must renew existing document path without clearing board binding.
* Change `CardBodyPopoverEntry` document-binding effect so `cardPath` change alone does not run `setBoardDocument(null)`, discard history, close document, or open another document. Resolve initial/current card by `internalId` if needed, because using old path after rename is invalid.
* Keep existing cleanup when popup entry closes, project changes, or stable card identity changes. These events end document lifetime and must still release board membership and history.
* Keep `CardPopupService` path update, `OpenFilesService` stable-identity renewal, title serialization, file move, watcher echo suppression, and unsaved-body preservation unchanged.
* Add regression coverage at popup/document-binding boundary. Test must use clean card body, because reported failure occurs when body was not edited and no dirty draft protects binding.

## Acceptance criteria

* Open card with existing clean body. Change title through card UI so filename changes. Popup stays open and body remains visible throughout rename.
* Active `board-card` Markdown target never becomes `null` because only card path changed.
* Same logical open card document remains bound across rename; its `path` changes to committed target path.
* Title and first body heading use new title, while remainder of body stays unchanged in editor, loaded card, and committed file.
* Closing and reopening card is not required to restore body.
* Actual popup close, project change, or card identity change still clears binding and releases document.
* Existing dirty-body rename behavior, card rename tests, watcher tests, and card popup tests pass. Add regression test that fails before fix.