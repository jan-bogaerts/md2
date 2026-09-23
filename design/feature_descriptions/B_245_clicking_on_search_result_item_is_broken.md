---
author: 
id: B_245
internalId: a8daacc1-09c2-4447-84f6-f7240e33f570
title: clicking on search result item is broken
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__a8daacc1-09c2-4447-84f6-f7240e33f570.json
policy:
---

when user clicks on a global search result item, nothing happens anymore. this is broken so it seems.

## Current state

`SearchResults` renders clickable rows, and `SearchPanel` has handlers for card and action results. `SearchPanel` also closes search when focus leaves its control. Results live in a portaled `ResizablePopper` (rendered elsewhere in the document), so a row gaining focus can look like outside focus. Closing unmounts the row before its click completes. This is the likely cause from code inspection; existing tests dispatch `click` without the preceding pointer and focus events, so they do not reproduce it.

## Implementation details

* In `SearchPanel`, treat focus moving into its results popup as internal search interaction. Close search when focus moves outside both the control and results popup. Keep this handling local to search.
* Keep result selection behavior: active cards in cards view are selected and scrolled into view; other files open in the current view; archived and released cards in cards view open a read-only preview; action results open their action popup or source file according to view mode.
* Add a regression test that uses the real pointer, focus, and click sequence on a result. Cover desktop search and mobile search, including outside-focus dismissal.

## Acceptance criteria

* Clicking an active card result in cards view selects and scrolls to that card; search closes after selection.
* Clicking a file result opens its file in the current view. Clicking an archived or released card in cards view opens its read-only preview. Clicking an action result opens its action popup in cards view or source file in text view.
* Focusing or clicking inside the results popup keeps it mounted until selection finishes. Moving focus outside search closes it.
* Pointer-based regression tests pass for desktop and mobile search; existing focused search tests, lint, and typecheck pass.
