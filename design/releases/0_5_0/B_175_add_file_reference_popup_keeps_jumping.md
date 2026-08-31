---
author: 
id: B_175
internalId: 22fa2af9-9b97-47c2-931f-ed5a5a62f89d
title: add file reference popup keeps jumping
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__22fa2af9-9b97-47c2-931f-ed5a5a62f89d.json
policy:
after: d0c8354f-cfea-4ad6-b863-9bd2dbb54b52
---

When the user enters the 'at' character, we show a popup where the user can select a file reference to insert in the markdown text. this works, however, the popup behaves badly when the user keeps typing in order to refine the search in the popup: it keeps moving / repositioning itself and resizing. neither should happen. the anchor position should remain at where it was first opened when the 'at' char was typed and keep the popup the same size. in fact, it should use the already available resizable popup. the search results popup, card and action popups already use it.

## Current state

`MarkdownFileSearchTypeaheadPlugin` (`app/src/components/editor/markdown_file_search_typeahead_plugin.tsx`) renders Lexical's `LexicalTypeaheadMenuPlugin`. Lexical owns a single anchor `div` per typeahead session, created by `useMenuAnchorRef` and appended to the editor's `overlayContainer`. `MarkdownFileSearchMenu` is portalled into that anchor `div`, and passes it as `anchorElement` to `ResizablePopper`.

Two independent causes make the popup move and resize while the user keeps typing after `@`:

* **Anchor keeps growing.** Lexical's `positionMenu` sizes the anchor `div` to the DOM range that runs from the `@` character to the caret, so every typed character re-runs `positionMenu` and widens (and re-tops) the anchor. MUI `Popper` re-measures its anchor and re-runs the `flip` and `preventOverflow` modifiers, so the paper shifts.
* **Popup remounts per result count.** `MarkdownFileSearchMenu` derives `height` from `options.length * FILE_SEARCH_OPTION_ESTIMATED_HEIGHT` capped at `FILE_SEARCH_MENU_MAX_HEIGHT`, passes it as `initialSize.height`, and passes `key={height}`. Refining the query changes the result count, which changes the key, which unmounts and remounts `ResizablePopper`; the new instance re-runs `loadSize`, so the popup visibly resizes.
* **Empty result set unmounts the popup.** `renderMenu` returns `null` when `itemProps.options.length === 0`, so the popup disappears and reappears at a new anchor as soon as matches return.

`ResizablePopper` (`app/src/components/resizable_popper.tsx`) is already the shared resizable popup used by the search panel, the card body popover and the action popup frame; those callers do not jump because their anchor is a stationary button. Size persistence already works here through `storageKey` `md2.markdownFileSearchMenuSize` with `persistSizeOnResizeEndOnly`.

## implementation details

* **Frozen anchor.** Add a stable anchor element for the file-reference popup instead of using Lexical's growing anchor `div` directly. On mount of `MarkdownFileSearchMenu` (one mount per typeahead session), create a zero-width `div`, append it to the Lexical anchor's parent (the `overlayContainer`), copy the Lexical anchor's current `left`/`top` page coordinates and its height once, and remove it on unmount. **Frozen** means the element is positioned once, at the moment the `@` trigger opened the session, and is never repositioned while the query changes; because it lives in the same scrolling container as Lexical's anchor, it still travels with the editor when the user scrolls.
* Pass that frozen element to `ResizablePopper` as `anchorElement`. Lexical may keep mutating its own anchor `div`; that must no longer influence popup placement.
* **Fixed size.** Drop the content-derived `height` and the `key={height}` prop. Pass a constant `initialSize` of `FILE_SEARCH_MENU_DEFAULT_WIDTH` by `FILE_SEARCH_MENU_MAX_HEIGHT`. A size restored from `applicationStorage` still wins, and a user resize still persists on pointer-up. The popup keeps one size for the whole session regardless of how many files match.
* **Keep open on zero matches.** `renderMenu` must stop returning `null` for an empty option list, and only bail when the anchor element is missing. `MarkdownFileSearchMenu` renders a "No matching files" message in place of the `Virtuoso` list when `options` is empty. Keyboard handling for an empty list stays with Lexical: no highlighted option, `Enter` selects nothing, `Escape` and typing a space or `@` still close the session through the existing trigger rules.
* Do not change the trigger rules (`markdown_file_search_trigger.ts`), the filtering (`markdown_file_search_options.ts`), option rendering, selection/replacement (`markdown_file_search_selection.ts`), or `ResizablePopper` itself.
* Leave `MarkdownPlaceholderTypeaheadPlugin` (`{{` placeholders) unchanged; this bug is scoped to the `@` file-reference popup.
* Tests: extend `markdown_file_search_menu.test.tsx` for constant size across changing option counts, for the empty-state message, and for the frozen anchor surviving mutation of the Lexical anchor element. Add or extend a typeahead-plugin test covering that an empty option list still renders the menu. Run the focused editor tests, `npm run typecheck`, and app lint.

## acceptance criteria

* Typing `@` opens the file popup below the `@` character; typing further query characters leaves the popup's on-screen position unchanged.
* The popup's width and height stay identical for the whole session, regardless of how many files match.
* A size the user set by dragging a resize handle survives further typing in the same session and is restored on the next session.
* A query with zero matches keeps the popup open, at the same position and size, showing a "No matching files" message; matches reappearing does not move or resize it.
* Scrolling the editor while the popup is open keeps the popup aligned with the `@` character; the popup closes when Lexical detects the anchor left the view.
* Closing the popup and typing a new `@` elsewhere opens it at the new `@` character.
* Selecting a file with the mouse or with the arrow keys plus `Enter` still inserts the file link exactly as before; `Escape` still closes the popup.
* The popup remains the shared `ResizablePopper` surface, on the same stacking layer as today when the editor sits inside another popup.
* Placeholder (`{{`) typeahead behavior is unchanged.
* Focused editor tests, `npm run typecheck`, and app lint pass.
