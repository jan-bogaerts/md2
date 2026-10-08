---
author: 
id: F_408
internalId: 45e13c03-d74d-4082-9065-aa387f6553f5
title: add close icon to search boxes
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__45e13c03-d74d-4082-9065-aa387f6553f5.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
---
We have search boxes in various places:

* global search
* search in action popup (chat log)
* search on card popup

they don't have close buttons. lets add them

## Current state

"Close" here means dismiss the search box (same effect as existing `Esc` / blur close), not clear the query.

* **Global search** (`app/src/components/shell/search/`):
  * `SearchControl` owns `isOpen` and `closeSearch()`; renders `SearchPanel` inline (`full`/`search` presentation) or inside a `Popover` (`icon`/`shortcut` presentation or mobile).
  * `SearchPanel` `TextField` (`aria-label="Search project"`): start adornment `Magnify`, end adornment shortcut label. No close control.
  * Closes today only on: focus leaving panel and results (`handleSearchBlur` → `onClose`), result selection, or `Popover` `Esc`/backdrop (popover mode only). Inline mode has no `Esc` close.
  * Close keeps query: `SearchLauncher` shows it read-only after close.
* **Action popup chat-log search** (`app/src/components/actions/conversation/search/`):
  * `ActionConversationSearchRow` renders `role="search"` row: `TextField` ("Find in conversation"), result count, Previous/Next, "Match case" toggle. No close control.
  * State owned by `ActionConversationSearchService`; `closeSearch()` exists, called only from `handlePopupKeyDown` on `Esc`. Close keeps draft/submitted term.
  * Row lives in `ActionPopupFrame` header, which already has a popup close `IconButton` with `aria-label="Close"`.
* **Card popup search** = editor-local "Find text" popup:
  * `MarkdownLocalTextSearchPlugin` (`app/src/components/editor/local_search/markdown_local_text_search_plugin.tsx`), component state `open`, `closeSearch()` callback. Closes only on window `Esc`.
  * Shared by every `MarkdownEditor` with `localTextSearch` enabled (card popup, text view, …); all get the change.
* Style: icon-only control needs `Tooltip` + matching `aria-label`, `@mui/icons-material` Outlined icons, `fontSize="small"` (`design/STYLE_GUIDE.md`; sibling Previous/Next buttons).

## Implementation details

Use one shared look in all three places: `IconButton` `size="small"`, `aria-label="Close search"`, wrapped in `Tooltip title="Close search"`, icon `CloseOutlined` (`@mui/icons-material/CloseOutlined`) `fontSize="small"`. Label "Close search" avoids clash with action popup "Close" button.

1. **Global search** — `search_panel.tsx`:
   * Add close button in `TextField` end adornment, after shortcut label.
   * Click handler constant `handleCloseClick` calls `onClose()`. No query change.
   * Button sits inside panel `Box`, so `handleSearchBlur` ignores focus moving to it; click then closes. Works for inline and popover modes, since both pass `closeSearch` as `onClose`.
   * `SearchLauncher` unchanged (closed state has nothing to close).
2. **Chat-log search** — `action_conversation_search_row.tsx`:
   * Add close button as last item of row, after "Match case".
   * Handler constant `handleClose` calls `service.closeSearch()`. Service unchanged.
3. **Editor-local search** — `markdown_local_text_search_plugin.tsx`:
   * Add close button as last item in popup `Box`, after "Match case"; `onClick={closeSearch}`.
   * Popup width fixed `420`; check controls still fit, widen to named constant only if needed.
4. No service, event, or state-shape changes. Close keeps current terms in all three (same as `Esc`).

### Edge cases

* Global search inline mode: clicking close must not first trigger results-dropdown dismissal — focus stays inside panel, so only `onClose` runs.
* Chat-log search: close while a match is selected keeps DOM selection (same as `Esc`).
* Editor search: close button reachable by `Tab`; `Esc` behavior unchanged.
* No focus restore after close (matches `Esc`).

### Tests

* `search_control.test.tsx`: open search, click "Close search" → panel input gone, launcher shows previous query; repeat for popover (mobile) mode.
* `action_conversation_search_controls.test.tsx`: open search, click "Close search" → search row gone; reopening keeps draft term.
* `markdown_editor_local_text_search.test.tsx`: open popup, click "Close search" → popup gone.

## Acceptance criteria

* Global search panel (inline and popover), action-popup chat-log search, and editor "Find text" popup each show an icon-only close button.
* Button has tooltip and accessible name "Close search".
* Clicking it hides the search box; same outcome as `Esc`.
* Global search query stays visible in launcher after close; chat-log and editor search keep draft term when reopened.
* Action popup "Close" button and existing `Esc` behavior unchanged.