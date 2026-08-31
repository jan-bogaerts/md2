---
author: 
id: F_240
internalId: db4400c0-0d7f-4265-8939-8b4e493c7208
title: action popup card id add tooltip
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__db4400c0-0d7f-4265-8939-8b4e493c7208.json
policy:
after: 2bdcda91-18c2-42ea-8ebb-1208250a4d42
---
on the action popup, in the upper left corner, we show the id of the card (if any). we should add a tooltip to that shows the title of the card.

be careful: I think the component currently doesn't capture mouse events cause it shows a drag icon to move the popup around

## Current state

The card id badge lives in the action popup toolbar in `app/src/components/actions/run/popup/action_popup_frame.tsx`. It renders as a plain `Box component="span"` holding `contentProps.target`, with no tooltip, no accessible name beyond its text, and no focusability.

`target` is resolved in `app/src/components/actions/run/popup/action_popup.tsx` by `resolvePopupTarget`: for a `project` context it is the literal string `Project`; for a `card` context it looks up the card in `snapshot.activeCards` + `snapshot.backgroundCards` by `cardInternalId` and returns `header.id`; every other context kind yields `null`, so no badge is drawn.

Drag concern from the description — checked, it does not block hover. The badge sits inside the `Box` carrying `data-drag-handle="true"`, and `ResizablePopper.startDrag` (`app/src/components/resizable_popper.tsx:269`) reacts to **pointerdown** only: it walks up from the event target, ignores anything matching `INTERACTIVE_SELECTOR` (`button, input, select, textarea, a, label, [role=...], [contenteditable]`), then calls `event.preventDefault()` and attaches window pointermove/pointerup listeners. Tooltips open on `mouseenter`/`focus`, which drag start never intercepts or suppresses. Two consequences follow: a tooltip on the badge will open on hover as-is, and the badge must stay outside `INTERACTIVE_SELECTOR` (no `<button>`, no `role="button"`) or dragging the popup by its upper-left corner stops working.

The same toolbar already renders MUI `Tooltip` on the expand/collapse and close buttons, so tooltip rendering inside the popper stack is proven to work.

The card title is available two ways: `contentProps.baseContext.title` (captured when the context was built, may be stale after a run edits its own card) and the live card header found by the same snapshot lookup `resolvePopupTarget` already performs.

## Implementation details

* In `action_popup.tsx`, extend the target resolution so it returns both the displayed id and the card title from the same snapshot lookup, e.g. `resolvePopupTarget` returning `{ id, title }` or a sibling `resolvePopupTargetTitle`. Use the live `header.title` from the snapshot so the tooltip follows a title changed mid-run; fall back to `context.title` when the card is not in the snapshot. Pass the title to `ActionPopupContent` as a new optional `targetTitle: string | null` field on `ActionPopupContentProps` (`action_popup_types.ts`), alongside the existing `target`.
* In `action_popup_frame.tsx`, wrap the id badge in MUI `Tooltip` with `title={targetTitle}` when a title exists. MUI renders no tooltip for an empty title, so an absent title needs no branch beyond passing `''`/`null`.
* Keep the badge element a `span`. Do not convert it to a button or add `role="button"`; that would put it in `INTERACTIVE_SELECTOR` and break drag from the badge.
* For keyboard and screen-reader reach, give the badge `tabIndex={0}`. `[tabindex]` is not part of `INTERACTIVE_SELECTOR`, so drag from the badge is preserved while `Tooltip` gains its focus trigger.
* Project context: `target` is `Project` and there is no card, so `targetTitle` stays `null` and no tooltip appears.
* No desktop bridge, service, or data-model change is required; this is renderer-only and derives from state already loaded.

## Acceptance criteria

* Hovering the id badge in the action popup toolbar shows a tooltip containing the title of that card.
* The tooltip text matches the card's current title, including after a run has changed the title while the popup stayed open.
* Focusing the badge with the keyboard shows the same tooltip.
* Dragging the popup by pressing and moving on the id badge still moves the popup, exactly as before.
* No tooltip is shown for the `Project` badge, and popups with no badge (`file`, `folder`, `merge-conflict` contexts) are unchanged.
* A card whose title is empty or that is absent from the snapshot shows the badge with no tooltip rather than an empty tooltip box.
* Existing toolbar tooltips (expand/collapse, close), the worktree selector, and the conversation picker are unaffected.

## Testing

* Cover the card case: render the popup for a card context, hover the badge, assert the tooltip shows the card title.
* Cover the live-title case: change the card title in the snapshot while the popup is open, assert the tooltip follows.
* Cover the drag case: pointerdown + pointermove on the badge still repositions the popper.
* Cover the project case and the empty-title case: no tooltip.