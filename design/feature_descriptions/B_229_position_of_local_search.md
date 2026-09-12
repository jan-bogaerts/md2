---
author: 
id: B_229
internalId: 0be5ec62-c3e8-4d20-8b15-fd81f2636fc9
title: position of local search
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__0be5ec62-c3e8-4d20-8b15-fd81f2636fc9.json
policy:
after: 3ca60eff-65bc-44d0-929f-451e034102c4
branch: b_229_position_of_local_search
worktree: 3
---

The local search box that we show in the card popup should be sticky to the top and positioned below the toolbar.

currently, when you scroll the markdown text down, the search box also scrolls out of view. this is annoying.

## Current state

`CardBodyEditor` is the card popup's scroll container. `MarkdownEditor` keeps its formatting toolbar visible with CSS sticky positioning, meaning the toolbar stays at the top of that container while its Markdown body scrolls.

`MarkdownLocalTextSearchPlugin` renders the local-search `Popper` inside the supplied popup overlay container, but anchors it to the Lexical editor root with `placement="top-end"`. That root scrolls with the Markdown body, so the search box also leaves view. Search matching, selection, shortcuts, and editor data are otherwise independent of popup layout.

## Implementation details

* Define **sticky** here as remaining visible at the top of the card body scroll container while Markdown content scrolls beneath it.
* In `MarkdownLocalTextSearchPlugin`, use the active editor's visible `.mdxeditor-toolbar` as the `Popper` anchor and place the search box at the toolbar's bottom end. Because the toolbar is already sticky, the open search box then remains directly below it during card-body scrolling.
* Keep the editor-root anchor as the required fallback for editors whose toolbar is hidden. Do not add card-popup state, another scroll container, or a card-specific positioning mode.
* Keep `overlayContainer` portal ownership and modal stacking unchanged, so the box remains inside its dialog or popup host.
* Keep search term state, selected-text seeding, case matching, result navigation, `Ctrl+F`, `F3`, Escape, read-only behavior, Markdown content, dirty state, history, and persistence unchanged.
* Extend focused local-search tests to cover visible-toolbar anchoring and bottom placement. Extend the card-body editor regression test to verify that search uses its sticky toolbar. Existing hidden-toolbar and overlay-container tests must continue to pass.

## Acceptance criteria

* Opening local search from the card popup toolbar or with `Ctrl+F` shows the search box directly below the formatting toolbar.
* While the user scrolls the card's Markdown body, the formatting toolbar and open search box remain visible at the top of the card body area; Markdown content scrolls beneath them.
* Search box remains inside the card popup and above its Markdown content in normal, fullscreen, and mobile popup layouts.
* Editors with hidden toolbars can still open local search with `Ctrl+F`; their search box remains anchored to the editor root.
* Search behavior and keyboard controls remain unchanged, and searching causes no Markdown edit, dirty-state change, history entry, or persistence write.
