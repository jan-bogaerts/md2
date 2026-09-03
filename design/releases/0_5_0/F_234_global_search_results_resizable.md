---
author: 
id: F_234
internalId: 56bd50ce-b28c-4eb4-83cb-1951221f7864
title: global search results resizable
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__56bd50ce-b28c-4eb4-83cb-1951221f7864.json
policy:
after: 902e08a9-8b29-4037-ab3d-92d53aef4fc8
---
the global search results popup is currently not resizable. it should be. we already have a couple of resizable popup that all use the same base component. perhaps we can use this again?

## Current state

The global search dropdown lives in `app/src/components/shell/search/search_panel.tsx` (component `SearchPanel`). Its results panel is a plain MUI `Paper`, absolutely positioned below the search input, with a fixed `maxHeight` of 420px (`RESULTS_MAX_HEIGHT`) and a fixed `width` equal to the input's max width of 460px (`RESULTS_WIDTH`). The panel has no drag handle and cannot be resized by the user; a long result list simply scrolls inside the fixed 420px box.

Elsewhere in the app, resizable popups already exist and share one base component, `ResizablePopper` (`app/src/components/resizable_popper.tsx`). It wraps MUI's `Popper` + `Paper`, adds pointer-driven resize handles (corner or edges), optional dragging, viewport clamping, and optional size persistence to `localStorage` via a `storageKey`. It is already used by `card_body_popover.tsx` (card detail popup) and `action_popup_frame.tsx` (action run popup), among others.

## Implementation details

Replace the plain `Paper` dropdown in `SearchPanel` with `ResizablePopper`:

* `anchorElement`: the existing `controlElement` (the search box wrapper), so the popper still anchors under the input the way the current `Paper` does.
* `open`: the existing `isDropdownOpen` condition.
* `draggable`: `false` — the dropdown stays anchored under the search box; only resizing is needed, not moving.
* `resizeCorner`: `'lower-right'` (the default), giving a single corner resize handle, consistent with the plain (non-`resizeFromAllSides`) usages elsewhere.
* `initialSize`: `{ width: RESULTS_WIDTH, height: RESULTS_MAX_HEIGHT }`, keeping today's default dimensions unchanged.
* `minimumSize`: a sensible floor so the results list and the option toggles (RegExp mode, background-body search, actions search, ask-agent) stay usable — e.g. the component's own default (280×200) is likely enough, but should be checked against the options row's minimum width.
* `constrainSizeToViewport`: `true`, so the dropdown cannot be resized past the visible window.
* `storageKey`: a new key (e.g. `'search-panel-results-size'`) so the user's chosen size is remembered across searches and app restarts, matching the pattern used by other resizable popups.
* `labelId` / `resizeLabel`: labels analogous to the existing `aria-label="Search dropdown"` on the current `Paper`.
* `onClose`: since the panel currently closes via the `onBlur` handler on the outer `Box` (`handleControlBlur`) rather than via the popper itself, `closeOnEscape` should be set to `false` so `ResizablePopper` does not require or duplicate its own close handling; blur-to-close behavior on the outer `Box` is unaffected because that listener stays on the wrapping `Box`, not on the popper.
* The search options row (`Box aria-label="Search options"`) and the `SearchResults` component become the `children` of `ResizablePopper`, unchanged internally.

No changes are needed in `search_results.tsx` or the search services — this is a container/layout swap only.

## Acceptance criteria

* The global search results dropdown can be resized by dragging a handle at its lower-right corner.
* Resizing respects a minimum size that keeps the option toggles and at least one result row visible/usable.
* Resizing cannot grow the popup beyond the visible viewport.
* The chosen size persists across closing/reopening the dropdown and across app restarts (stored in `localStorage`).
* Default size (when no stored size exists) matches today's dimensions (460×420).
* Existing behavior is unchanged: clicking outside still closes the dropdown, selecting a result still navigates and closes it, and the RegExp/background-body/actions toggles and "ask agent" button keep working.