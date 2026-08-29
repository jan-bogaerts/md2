---
author: 
id: F_251
internalId: 67aa408b-6038-40b7-a82d-76678ca7b201
title: action popup height and location
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__67aa408b-6038-40b7-a82d-76678ca7b201.json
policy:
---
when the height of the action popup wants to be bigger than the height of the app, it sort of shows up as max height, but the popup tries to leave some room at the bottom of the popup and perhaps also a little bit at the top.&#x20;

At the bottom, we don't need to do this, it can be at the edge of the bottom (not below), but it should remain a little more below the edge at the top, cause the close button in the upper right corner of the action popup can no longer be clicked on when it is behind the drag area of the main window (to move the window around), which is annoying.

Also when the action popup is fully expanded and on large screen (not mobile), then we also need to leave some room at the top.

## Current state

The action popup surface is `ResizablePopper` (`app/src/components/resizable_popper.tsx`), configured by `ActionPopupFrame` (`app/src/components/actions/run/popup/action_popup_frame.tsx`). The same surface backs the card body popover (`app/src/components/card_view/card_body_popover.tsx`), the search dropdown and the file-reference typeahead.

**Drag region** means the strip of the borderless Electron window that moves the window when pressed: `MainToolbar` (`app/src/components/shell/menu/main_toolbar.tsx`) puts `-webkit-app-region: drag` on a `Toolbar` of `MENU_ROW_HEIGHT` = 44px at the very top of the window, and its interactive children opt back out with `no-drag`. A popup paper that overlaps that strip is not marked `no-drag`, so the OS treats a press there as a window drag and the popup's own buttons — including the Close button in its upper-right corner — never receive the click.

**Full height** means the state toggled by the toolbar's "Expand upward" / "Collapse downward" button: `ActionPopup` (`app/src/components/actions/run/popup/action_popup.tsx`) holds the `fullHeight` state and passes it down; the button is hidden on mobile.

Today `ResizablePopper` uses one symmetric margin for every edge, `VIEWPORT_MARGIN` = 16 (`resizable_popper.tsx:66`):

* `PREVENT_VIEWPORT_OVERFLOW_MODIFIER` (`resizable_popper.tsx:72`) passes `padding: VIEWPORT_MARGIN` to Popper's `preventOverflow`, so an anchored popup is pushed 16px away from both the top and the bottom viewport edge.
* The paper's `maxHeight` is `calc(100vh - 32px)` when not full height (`resizable_popper.tsx:413`), which is where "it sort of shows up as max height" comes from: the popup stops 16px short of the bottom and 16px short of the top.
* `clampSizeToViewport` (`resizable_popper.tsx:80`) caps a stored or resized height at `window.innerHeight - VIEWPORT_MARGIN * 2`. Only callers passing `constrainSizeToViewport` use it; the card body popover does, the action popup does not.
* `clampDetachedTop` (`resizable_popper.tsx:147`) clamps a dragged or centered popup to `0 .. window.innerHeight - height`, so the user can drag the popup fully under the 44px drag region and lose the Close button, and `centeredPosition` (`resizable_popper.tsx:151`) can place it there on open.
* In full height the paper style is `{ height: '100vh', top: 0 }` (`resizable_popper.tsx:380`) with `maxHeight: '100vh'`, so an expanded popup sits flush against the top of the window and its Close button lands inside the drag region every time. This is the "fully expanded on large screen" case in the report.

A precedent for the wanted top gap already exists: `POPOVER_TOP_MARGIN` = 60 in `app/src/components/resizable_popover.tsx:36`, used by the card body popover's fullscreen mode (`card_body_popover.tsx:264` and `card_body_popover.tsx:291`) exactly to stay clear of the top of the window. 60 clears the 44px drag region with room to spare. That fullscreen height is `calc(100vh - ${POPOVER_TOP_MARGIN + POPOVER_SIDE_MARGIN}px)`, so it also leaves the unwanted 16px at the bottom.

The mobile layout is a separate branch and is not affected: both popups force `top: 0`, `height: 100dvh` and `width: 100vw` with `!important`, dragging and resizing are off, and the browser has no window drag region.

## implementation details

* **Asymmetric viewport insets on `ResizablePopper`.** Add two optional numeric props, `topInset` and `bottomInset`, both defaulting to `VIEWPORT_MARGIN` so every current caller keeps today's geometry. **Inset** here means the gap the popup must leave between its own edge and the corresponding viewport edge. Horizontal margins stay `VIEWPORT_MARGIN`. Thread the two values through every place that currently assumes symmetry:
    * Build the `preventOverflow` modifier per instance (a `useMemo`, since `PREVENT_VIEWPORT_OVERFLOW_MODIFIER` is a module constant today) with `padding: { bottom: bottomInset, left: VIEWPORT_MARGIN, right: VIEWPORT_MARGIN, top: topInset }`. Popper accepts that object form for `padding`. Both `VIEWPORT_MODIFIERS` and `FULL_HEIGHT_VIEWPORT_MODIFIERS` must use it.
    * Paper `maxHeight`: `calc(100vh - ${topInset + bottomInset}px)` when not full height, `calc(100vh - ${topInset}px)` when full height.
    * Full-height paper style: `top: topInset` and `height: calc(100vh - ${topInset}px)` instead of `top: 0` and `height: '100vh'`.
    * `clampSizeToViewport`: the maximum height becomes `window.innerHeight - topInset - bottomInset`.
    * `clampDetachedTop`: clamp to `topInset .. window.innerHeight - bottomInset - height`, keeping a guard so the lower bound never exceeds the upper one on a short viewport. This is what stops the user dragging the popup under the drag region, and it also constrains `centeredPosition` and the two `window.resize` handlers that re-clamp on viewport changes, because they all route through the same helper.
* **Action popup wiring.** In `ActionPopupFrame`, pass `bottomInset={isMobile ? VIEWPORT_MARGIN : 0}` and `topInset={isMobile ? VIEWPORT_MARGIN : POPOVER_TOP_MARGIN}`, importing `POPOVER_TOP_MARGIN` from `resizable_popover`. On mobile the `!important` paper overrides still win, so the values passed there only need to stay harmless. Nothing else in the frame changes; the "Expand upward" toggle keeps its current meaning, it just expands up to the top gap instead of up to the window edge.
* **Card popup wiring.** Give `CardBodyPopover` the same two props on the non-mobile path. Its fullscreen height changes to `calc(100vh - ${POPOVER_TOP_MARGIN}px)` so fullscreen also reaches the bottom edge; its fullscreen `top` is already `POPOVER_TOP_MARGIN` and stays. Because it passes `constrainSizeToViewport`, its size clamping then follows the new insets automatically.
* **Do not change** the search dropdown (`search_panel.tsx`), the file-reference typeahead (`markdown_file_search_menu.tsx`), or `resizable_popover.tsx`; they keep the default symmetric 16px insets.
* Reaching the bottom edge is deliberate: flush with the bottom, never past it. The clamps above must never produce a negative height or a top above `topInset`.
* Marking the popup paper `-webkit-app-region: no-drag` (as `search_panel.tsx:282` does) was considered as an alternative to the top gap and rejected: it would let the popup keep covering the toolbar, which is the layout this card asks to avoid.
* Tests: extend `resizable_popper.test.tsx` for the inset props — anchored `maxHeight`, full-height `top` and `height`, drag clamping at the top and at the bottom, and `constrainSizeToViewport` with asymmetric insets. Extend `action_popup.test.tsx`; its existing full-height test "expands upward and restores the anchored size after collapse" asserts `height === '100vh'` and must be updated. Extend the card body popover tests for the new fullscreen height. Run the focused popup tests, `npm run typecheck`, and app lint.

## acceptance criteria

* On desktop, an action popup whose wanted height exceeds the available space renders with its bottom edge flush against the bottom of the window — no gap below it, and no part of it below the window edge.
* On desktop, the top edge of the action popup never rises above 60px from the top of the window, so its Close button, its "Expand upward" / "Collapse downward" button and its toolbar always sit below the 44px window drag region and always receive clicks.
* Clicking "Expand upward" on desktop makes the popup span from 60px down to the bottom edge of the window; clicking "Collapse downward" restores the previous anchored size and position exactly as it does today.
* Dragging the popup by its toolbar cannot move it above the 60px top gap and cannot move it below the bottom edge; releasing the drag near either limit leaves it resting at the limit.
* Resizing from the top edge, and a size restored from `md2.cardRunPopupSize` or `md2.projectAgentPopupSize`, obey the same limits.
* Resizing the window while the popup is open re-clamps it to the same limits instead of leaving it under the drag region or off-screen.
* The card body popover follows the same rules on desktop: bottom flush, top no higher than 60px, and its fullscreen mode now reaches the bottom edge.
* The mobile layout of both popups is unchanged: full-bleed, `top: 0`, `height: 100dvh`, `width: 100vw`, no resize handles, no full-height toggle.
* The search dropdown and the `@` file-reference popup keep their current 16px margins on all edges.
* Focused popup tests, `npm run typecheck`, and app lint pass.
