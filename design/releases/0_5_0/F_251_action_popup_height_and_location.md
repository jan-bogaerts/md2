---
author: 
id: F_251
internalId: 67aa408b-6038-40b7-a82d-76678ca7b201
title: action popup height and location
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__67aa408b-6038-40b7-a82d-76678ca7b201.json
policy:
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_frame.tsx
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/card_view/card_body_popover_commit.test.tsx
  - app/src/components/resizable_popper.test.tsx
  - app/src/components/resizable_popper.tsx
after: 279da862-4385-442f-9c26-10d3bdde07e5
---
when the height of the action popup wants to be bigger than the height of the app, it sort of shows up as max height, but the popup tries to leave some room at the bottom of the popup and perhaps also a little bit at the top.&#x20;

At the bottom, we don't need to do this, it can be at the edge of the bottom (not below), but it should remain a little more below the edge at the top, cause the close button in the upper right corner of the action popup can no longer be clicked on when it is behind the drag area of the main window (to move the window around), which is annoying.

Also when the action popup is fully expanded and on large screen (not mobile), then we also need to leave some room at the top.

## Current state

The action popup surface is `ResizablePopper` (`app/src/components/resizable_popper.tsx`), configured by `ActionPopupFrame` (`app/src/components/actions/run/popup/action_popup_frame.tsx`). The same surface backs the card body popover (`app/src/components/card_view/card_body_popover.tsx`), the search dropdown and the file-reference typeahead.

**Drag region** means the strip of the borderless Electron window that moves the window when pressed. `MainToolbar` (`app/src/components/shell/menu/main_toolbar.tsx`) puts `-webkit-app-region: drag` on a `Toolbar` of `MENU_ROW_HEIGHT` = 44px at the top of the window, and its interactive children opt back out with `NO_DRAG_REGION` (`app/src/components/shell/drag_region.ts`). Electron turns those declarations into drag and no-drag rectangles. The popup paper declares neither, so it contributes no rectangle of its own: wherever it overlaps the toolbar, the toolbar's drag rectangle still wins and the OS consumes the press as a window drag. The popup's Close button in its upper-right corner therefore never receives the click. This is the bug, and it has two triggers:

* A popup whose wanted height exceeds the viewport is clamped by `maxHeight: calc(100vh - 32px)` (`resizable_popper.tsx:413`) and pushed to 16px below the top edge by the `preventOverflow` padding, which is still inside the 44px drag region.
* **Full height** — the state toggled by the toolbar's "Expand upward" / "Collapse downward" button, held as `fullHeight` in `ActionPopup` (`app/src/components/actions/run/popup/action_popup.tsx`) and hidden on mobile — sets the paper to `{ height: '100vh', top: 0 }` (`resizable_popper.tsx:380`), so the popup starts flush at the window edge and its Close button lands in the drag region every time.

`SearchPanel` already solves exactly this for its dropdown by spreading `NO_DRAG_REGION` into `paperSx` (`app/src/components/shell/search/search_panel.tsx:282`), which gives the paper its own no-drag rectangle that is subtracted from the toolbar's drag rectangle. Electron recomputes those rectangles as the DOM changes, so it holds while the popup moves and resizes.

Separately, `ResizablePopper` uses one symmetric margin for every edge, `VIEWPORT_MARGIN` = 16 (`resizable_popper.tsx:66`), which is the unwanted gap at the bottom:

* `PREVENT_VIEWPORT_OVERFLOW_MODIFIER` (`resizable_popper.tsx:72`) passes `padding: VIEWPORT_MARGIN` to Popper's `preventOverflow`, keeping an anchored popup 16px clear of the bottom edge.
* The paper's `maxHeight` of `calc(100vh - 32px)` spends 16px of that budget on the bottom.
* `clampSizeToViewport` (`resizable_popper.tsx:80`) caps a stored or resized height at `window.innerHeight - VIEWPORT_MARGIN * 2`. Only callers passing `constrainSizeToViewport` use it; the card body popover does, the action popup does not.
* The card body popover's fullscreen height is `calc(100vh - ${POPOVER_TOP_MARGIN + POPOVER_SIDE_MARGIN}px)` (`card_body_popover.tsx:264`), so it leaves the same 16px at the bottom.

Dragging and full height already allow a flush bottom: `clampDetachedTop` (`resizable_popper.tsx:147`) clamps to `window.innerHeight - height`, and full height is `100vh`.

The mobile layout is a separate branch and is not affected: both popups force `top: 0`, `height: 100dvh` and `width: 100vw` with `!important`, dragging and resizing are off, and the browser has no window drag region.

## implementation details

* **No-drag popup paper.** Spread `NO_DRAG_REGION` from `app/src/components/shell/drag_region.ts` into the `paperSx` of the action popup (`action_popup_frame.tsx`) and of the card body popover (`card_body_popover.tsx`), the same way `search_panel.tsx:282` does. This is the fix for the unclickable Close button, and it holds in every position: anchored, dragged, clamped to max height, and fully expanded. The popup's own drag handle (`data-drag-handle`, moved by pointer events in `ResizablePopper`) is unaffected, because it never used `-webkit-app-region`.
* **No top gap.** The popup keeps today's 16px top margin, and full height keeps `top: 0`. The consequence is accepted deliberately: an expanded popup covers the 44px toolbar, so while it is open the window cannot be dragged by that strip and the tabs, project name and search sit behind the popup.
* **Flush bottom.** Add one optional numeric prop to `ResizablePopper`, `bottomInset`, defaulting to `VIEWPORT_MARGIN` so every current caller keeps today's geometry. **Inset** here means the gap the popup must leave between its own edge and the viewport edge. Three places consume it:
    * Build the `preventOverflow` modifier per instance (a `useMemo`, since `PREVENT_VIEWPORT_OVERFLOW_MODIFIER` is a module constant today) with `padding: { bottom: bottomInset, left: VIEWPORT_MARGIN, right: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN }`. Popper accepts that object form for `padding`. Both `VIEWPORT_MODIFIERS` and `FULL_HEIGHT_VIEWPORT_MODIFIERS` must use it.
    * Paper `maxHeight` when not full height: `calc(100vh - ${VIEWPORT_MARGIN + bottomInset}px)`.
    * `clampSizeToViewport`: the maximum height becomes `window.innerHeight - VIEWPORT_MARGIN - bottomInset`.
    * `clampDetachedTop`, `centeredPosition` and the full-height paper style need no change; they already permit a flush bottom.
* **Callers.** `ActionPopupFrame` and `CardBodyPopover` pass `bottomInset={0}` on the non-mobile path. On mobile the `!important` paper overrides win regardless, so the value passed there only needs to stay harmless. The card body popover's fullscreen height becomes `calc(100vh - ${POPOVER_TOP_MARGIN}px)` so fullscreen also reaches the bottom edge; its fullscreen `top` of `POPOVER_TOP_MARGIN` is existing behavior and stays.
* Flush means touching the bottom edge, never crossing it. No clamp may produce a negative height.
* **Do not change** the search dropdown (`search_panel.tsx`), the file-reference typeahead (`markdown_file_search_menu.tsx`), or `resizable_popover.tsx`; they keep the default 16px bottom margin.
* Tests: extend `resizable_popper.test.tsx` for `bottomInset` — the anchored `maxHeight` and `constrainSizeToViewport` clamping. Extend `action_popup.test.tsx` and the card body popover tests for the no-drag paper style and for the new bottom geometry, including the popover's fullscreen height. `main_toolbar.test.tsx:15` already has a helper that reads `WebkitAppRegion` off an element and can be mirrored. Run the focused popup tests, `npm run typecheck`, and app lint.

## acceptance criteria

* The Close button of the action popup receives its click in every position, including when the popup overlaps the 44px window drag region, when it is clamped to maximum height, and when it is fully expanded.
* The same holds for the popup's other toolbar controls in that overlap: the "Expand upward" / "Collapse downward" button, the target badge, the worktree selector and the conversation picker.
* The card body popover behaves the same way in the overlap.
* On desktop, an action popup whose wanted height exceeds the available space renders with its bottom edge flush against the bottom of the window — no gap below it, and no part of it below the window edge.
* The same flush bottom applies to a popup dragged to the bottom, to a size restored from `md2.cardRunPopupSize` or `md2.projectAgentPopupSize`, and to a size set by dragging the bottom resize handle.
* The card body popover reaches the bottom edge too, in its normal and in its fullscreen mode.
* The top margin is unchanged: 16px when anchored, 0 when fully expanded. An expanded popup covering the toolbar is expected.
* Resizing the window while the popup is open keeps it inside the viewport as it does today.
* The mobile layout of both popups is unchanged: full-bleed, `top: 0`, `height: 100dvh`, `width: 100vw`, no resize handles, no full-height toggle.
* The search dropdown and the `@` file-reference popup keep their current 16px margin at the bottom.
* Focused popup tests, `npm run typecheck`, and app lint pass.
