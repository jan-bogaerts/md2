---
author: 
id: F_402
internalId: d3ccfd9e-0ccb-4a0b-8e4a-728607d1dcd9
title: add scrollbars to placeholder popup
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.0/card__d3ccfd9e-0ccb-4a0b-8e4a-728607d1dcd9.json
policy:
after: ee69c5dd-bb25-4e62-8837-e250eae7cc88
changedFiles:
  - app/src/components/editor/placeholders/markdown_placeholder_menu.grouped.test.tsx
  - app/src/components/editor/placeholders/markdown_placeholder_menu.tsx
---

sometimes there are more items on the 'placeholder' popup then can be shown, the popup doesn't have enough room.

We should show vertical scrollbars in that case.
## Current state

* Typing `{{` in a Markdown editor opens the placeholder typeahead. `MarkdownPlaceholderTypeaheadPlugin` portals `MarkdownPlaceholderMenu` into Lexical's anchor element.
* `MarkdownPlaceholderMenu` renders a `Paper` with `overflow: 'hidden'` and no maximum height. When the list is taller than the available space, the bottom options are clipped and cannot be reached by mouse.
* Lexical flips the menu above the caret only when the space above is larger than the full menu height. On arrow-key navigation it calls `scrollIntoView` on the highlighted option, but nothing inside the menu scrolls.
* The toolbar "Insert placeholder" control uses an MUI `Menu`, which already limits its height and scrolls. It is not part of this change.

## implementation details

* In `markdown_placeholder_menu.tsx`, add a named constant `PLACEHOLDER_MENU_MAX_HEIGHT = 320` (same value as `FILE_SEARCH_MENU_MAX_HEIGHT`). Make the `Paper` a flex column with `maxHeight: PLACEHOLDER_MENU_MAX_HEIGHT`; keep `overflow: 'hidden'` so the rounded corners still clip the content.
* Make the `List` the scroll container: `overflowY: 'auto'`, `minHeight: 0`. The vertical scrollbar appears only when the options exceed the maximum height.
* Keyboard navigation needs no extra code. Lexical's `scrollIntoView` on the highlighted option then scrolls the `List`. The fixed maximum height also lets Lexical's flip-above logic fit the menu more often.
* Do not change the z-index layering, option selection, or filtering.

## acceptance criteria

* With more placeholders than fit in 320px, the placeholder typeahead shows a vertical scrollbar and the remaining options can be reached by scrolling.
* With few placeholders, the menu sizes to its content and shows no scrollbar.
* Arrow-key navigation past the visible options scrolls the highlighted option into view. Enter or click still inserts the highlighted placeholder.
* The menu keeps its rounded border and still renders above the owning popup stack layer.
* Test in `markdown_placeholder_menu.grouped.test.tsx`: the listbox is the scroll container (`overflow-y: auto`). The pixel value is not asserted.
