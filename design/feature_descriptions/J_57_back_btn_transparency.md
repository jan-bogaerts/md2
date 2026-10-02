---
author: 
id: J_57
internalId: 8dfd4334-fd0d-429c-84dc-1657bb0b73ee
title: Back btn transparency
status: ready
owner: 
affects:
agents:
  - design/activity/card__8dfd4334-fd0d-429c-84dc-1657bb0b73ee.json
policy:
branch: j_57_back_btn_transparency
worktree: 3
changedFiles:
  - app/src/components/horizontal_scroll_area.tsx
---

The app bar and markdown toolbar are wrapped on our own custom scrollbox. It shows a back button when not enough room and user scrolled.

This button has too much transparency. It is very hard to see the arrow.

## Current state

* The custom scrollbox is `HorizontalScrollArea` (`app/src/components/horizontal_scroll_area.tsx`). It is used by the app menu `Tab` (app bar ribbon), the markdown editor toolbar (`markdown_editor.tsx`), and the Run popup `ActionSelector`. All three sit on `background.paper`.
* When content overflows and the user has scrolled right, the component shows a “Scroll left” `IconButton` (the back button) with `ChevronLeft`. At the opposite edge it shows a “Scroll right” button with the same styling. Both float over the scrolled content (`position: absolute`, width `SCROLL_BUTTON_WIDTH` = 32px).
* Transparency has two causes:
  1. **Fading background.** The button container background is a gradient from `background.paper` (solid until 60% of 32px ≈ 19px) to `transparent`. The small icon button is centered, so the inner half of the arrow lies over the semi-transparent part. Toolbar buttons scrolled underneath show through and blend with the arrow.
  2. **Icon color.** The `IconButton` uses MUI's default `action.active` color, which is semi-transparent black (`rgba(0,0,0,0.54)`) in light mode. `STYLE_GUIDE.md` specifies `custom.text3` for resting icons.

## implementation details

* Change `horizontal_scroll_area.tsx` only. Both scroll buttons share `buttonContainerSx`, so the fix applies to the back button and the forward button.
* Make the button container background solid `background.paper`, so nothing scrolls visibly beneath the arrow.
* Keep the fade as an edge hint, but move it outside the button: a `::after` pseudo-element on the container, placed against its inner edge (`left: '100%'` for the start button, `right: '100%'` for the end button), width a named constant `SCROLL_FADE_WIDTH` (8px), full height, `pointerEvents: 'none'`. The gradient runs from `background.paper` to `transparent` away from the button. Reuse `startFade`/`endFade`, changed to a 0% solid stop.
* Give the `IconButton` an opaque resting color `custom.text3` and hover color `primary.main`, per the ghost icon button rule in `STYLE_GUIDE.md`.
* Keep `SCROLL_BUTTON_WIDTH`, scroll step, `aria-label`s, visibility logic, wheel, and focus behavior unchanged. No change to the three call sites.
* Tests: the change is visual only. Existing `horizontal_scroll_area.test.tsx` must still pass; no new test, because tests asserting visual values are not kept. Run that test file, typecheck, and lint when implementing.

## acceptance criteria

* With the app menu ribbon, the markdown toolbar, or the Run popup action selector scrolled right, the back arrow is fully opaque and clearly visible; no toolbar content shows through behind it.
* The forward arrow at the opposite edge has the same opaque look.
* A short fade next to each button still marks that content continues beyond the edge.
* Arrow hover shows `primary.main`; both arrows are readable in light and dark themes and with every project background shade.
* Button visibility, click scrolling, wheel scrolling, and focus scrolling behave as before.