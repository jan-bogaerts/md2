---
author: 
id: B_217
internalId: 3a81bbba-94cd-4b06-9c53-198d765510b9
title: location of select file popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__3a81bbba-94cd-4b06-9c53-198d765510b9.json
policy:
after: 9d5878e6-2d20-4574-971d-57dbd82eb389
branch: b_217_location_of_select_file_popup
worktree: 3
changedFiles:
  - patch_tests.py
---

We have already done some work on this, but it is not yet ok: when we type the 'at' char in the markdown editor, we show a popup with a list of files out of which the user can select a file.

All this works ok, except for the location of the popup, it is too far from the cursor. I think we have a coordinate space issue where we are not converting correctly from or to child or parent coordinate space. we should fix this.

## Current state

Typing `@` in the markdown editor starts a Lexical typeahead session
(`app/src/components/editor/markdown_file_search_typeahead_plugin.tsx`). That plugin passes
`parent={overlayContainer}`, so Lexical appends its anchor `div` into the card popup's content
Box instead of `document.body`.

Lexical positions that anchor in `useMenuAnchorRef`
(`node_modules/@lexical/react/src/shared/LexicalMenu.tsx:666`): it takes the caret rect, which is
in **viewport coordinates** (origin = top-left of the visible window), adds `window.pageXOffset` /
`window.pageYOffset`, and writes the result to `style.left` / `style.top`. Those values are
therefore **page coordinates** (origin = top-left of the whole document). The anchor is styled
`position: absolute`, so the browser resolves those numbers against the anchor's **containing
block**: the nearest positioned ancestor.

Inside the card details popup that ancestor is the `ResizablePopper` Paper, which sets
`position: relative` (`app/src/components/resizable_popper.tsx:485`). So the caret coordinates get
re-interpreted as offsets from the Paper's padding box, and the anchor lands roughly
`(paperViewportLeft + scrollX, paperViewportTop + scrollY)` too far down and to the right.

`MarkdownFileSearchMenu` (`app/src/components/editor/markdown_file_search_menu.tsx`) copies those
same `left` / `top` / `height` strings verbatim onto its frozen stand-in anchor in
`copyAnchorPlacement`, then hands the stand-in to `ResizablePopper`, whose MUI `Popper` uses the
`fixed` strategy and reads `getBoundingClientRect()`. The freeze logic works as intended — the
popup stops chasing the caret on every keystroke — but it faithfully preserves the wrong offset,
which is the visible defect.

Editors that do **not** pass `overlayContainer` (action prompt, list action editor, text view card
editor) fall back to Lexical's default parent `document.body`, which is unpositioned, so page
coordinates resolve against the initial containing block and the popup lands correctly. That is why
the misplacement only shows up in the card details popup.

## Implementation details

Fix stays in `app/src/components/editor/markdown_file_search_menu.tsx`. Scope is the `@` file
selector only; the placeholder typeahead shares the root cause but is out of scope for this card.

1. Change `copyAnchorPlacement(source, target)` to convert coordinate spaces instead of copying
   style strings:
   - Read the numeric page coordinates: `parseFloat(source.style.left)` and
     `parseFloat(source.style.top)`. If either is `NaN`, leave the target untouched (test doubles
     and the pre-position frame can hand over empty styles).
   - Convert page → viewport: subtract `window.scrollX` / `window.scrollY`.
   - Convert viewport → containing-block-local: take `target.offsetParent` (the element the frozen
     anchor's own `position: absolute` resolves against — it is appended to the same parent as the
     Lexical anchor, so this is the popup Paper). Subtract `offsetParent.getBoundingClientRect()`
     left/top, add `offsetParent.scrollLeft` / `scrollTop`, and subtract the offset parent's
     border widths (`clientLeft` / `clientTop`), because `getBoundingClientRect` measures the
     border box while absolute offsets start at the padding box.
   - When `offsetParent` is `null` (anchor parent is `document.body`, the non-popup editors), the
     containing block is the initial containing block, so use the page coordinates unchanged.
   - Write the results as `px` strings to `target.style.left` / `target.style.top`; keep copying
     `height` as-is, since it is a length, not a coordinate.
2. Do the conversion inside the existing `requestAnimationFrame` callback in
   `useFrozenAnchorElement`, after `container.append(frozen)`, so `offsetParent` is resolvable and
   Lexical has already positioned its anchor.
3. Keep every other behaviour unchanged: one capture per typeahead session, zero-width stand-in,
   stand-in living in the same scrolling container so the popup travels with the editor, and the
   popup staying mounted on an empty result list.

Verification: `npm run typecheck` and the file-search suites
(`markdown_file_search_menu.grouped.test.tsx`, `markdown_editor_file_search.test.tsx`) in
`app`. The existing freeze test asserts the raw `120px` / `240px` copy, so it needs updating to the
converted expectation.

## Acceptance criteria

- Typing `@` in a card details popup editor opens the file list directly under the caret — the
  popup's top-left sits within a few pixels of the caret's baseline, not offset by the popup
  Paper's position.
- The same popup is still correctly placed in editors that render outside a positioned popup
  (action prompt, list action editor, text view card editor).
- Position stays correct after the page or the card popup content is scrolled, and after the card
  details popup is dragged or resized, because the frozen anchor still lives in the editor's
  container.
- The popup still freezes its anchor: continuing to type the query does not move the popup, and an
  empty result set keeps it open at the same spot showing "No matching files".
- Selecting a file still inserts the reference at the `@` query and closes the popup.
- `npm run typecheck` passes; file-search tests pass, including an updated/added test asserting the
  frozen anchor's coordinates are converted out of page space when the anchor sits inside a
  positioned container.

