---
author: 
id: F_157
internalId: a5f03c32-1395-498d-bbfd-10184c78a633
title: file selector popup resizable
status: ready
owner: 
affects:
agents:
  - design/activity/card__a5f03c32-1395-498d-bbfd-10184c78a633.json#conversation=agent-d7f00d0f-88d8-4564-b8c8-660ef54c1b00
  - design/activity/card__a5f03c32-1395-498d-bbfd-10184c78a633.json#conversation=agent-665d2ad6-d2a1-4f9c-9729-4145628ff416
policy:
---

when the user enters an `at` letter in the markdown editor, we show a file selector popup. This is currently of a fixed size. we should make this resizable. Size should be persisted in the app's local storage configuration (so local to the app)

## Current state

Typing `@` in a Markdown editor opens `MarkdownFileSearchMenu` at the caret. `LexicalTypeaheadMenuPlugin` owns popup opening, keyboard navigation, selection, and closing. The menu renders repository files through `Virtuoso` inside a `Paper` with a minimum width of 320 pixels and a height capped at 320 pixels. Users cannot change either dimension, and no file-selector size is stored.

`ResizablePopper` already provides anchored resizing, viewport limits, accessible resize handles, and JSON `{ height, width }` persistence in `window.localStorage`. Its only production caller is the action popup, whose current behavior must remain unchanged.

## implementation details

- Render file-search results inside `ResizablePopper`, anchored to the caret element supplied by `LexicalTypeaheadMenuPlugin`.
- Keep Lexical responsible for popup lifecycle, highlighted option, keyboard navigation, and file selection. Resizing must not insert text, move editor focus, select a file, or close the menu.
- Preserve current default dimensions: 320-pixel width and content-based height up to 320 pixels. Make `Virtuoso` fill the resized content area so extra results become reachable by scrolling.
- Allow pointer resizing from every edge and corner, matching the existing action-popup interaction. Constrain the popup to the viewport and keep a usable minimum size that can show one file row.
- Persist completed resize dimensions under a file-selector-specific local-storage key. Restore that size whenever the selector reopens, across editors and projects in the same app installation.
- Ignore missing, malformed, non-finite, or incomplete stored dimensions and use the default size. Clamp valid stored dimensions to minimum and viewport limits before display.
- If `ResizablePopper` needs configurable minimum size or Escape handling for this use, add focused props. Keep existing defaults for the action-popup call site; do not change its sizing, persistence, focus, drag, or close behavior.
- Preserve current popup theme, caret anchoring, stack position above an owning action popup, listbox semantics, option rendering, and virtualized scrolling.
- Add tests for pointer resizing, stored-size restoration, invalid stored data, viewport/minimum clamping, keyboard selection after resize, and unchanged action-popup behavior.

## acceptance criteria

- User can resize open file selector horizontally and vertically from every edge and corner.
- Popup stays anchored to current `@` query and remains within visible viewport while resized.
- File list fills resized popup and scrolls when results exceed available height.
- Completing a resize stores finite `height` and `width` values in file-selector-specific local storage.
- Reopening selector in any Markdown editor restores last stored size in same app installation; switching projects does not reset it.
- Missing, malformed, incomplete, or out-of-range stored size never breaks popup; safe default or clamped size appears instead.
- Resizing does not change query, highlighted option, editor focus, or selected Markdown content. Arrow keys, Enter, mouse selection, and Escape retain current behavior.
- Popup retains accessible `Project files` listbox and labelled resize handles, correct theme styling, caret placement, and stacking above owning popup.
- Action popup keeps existing resize, persistence, focus, drag, and close behavior.
