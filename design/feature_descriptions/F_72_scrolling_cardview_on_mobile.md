---
author: 
id: F_72
internalId: a1f4148a-3eba-433d-a603-4412a0952e34
title: Scrolling cardview on mobile
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__a1f4148a-3eba-433d-a603-4412a0952e34.json#conversation=agent-a091095c-727b-477a-a134-9b73e98b0bef
policy:
after: 
---
Scrolling cardview on mobile is tricky. Only small space to drag along edges. Otherwise card drag starts.&#x20;

Solution: add overlay at right and lzft edge that is a bit over the cards. When drag on these overlays: scroll

## Current state

- Mobile `CardView` stacks full-width columns in one vertically scrolling `Card columns` container.
- Each card has a full-surface dnd-kit activator with `touchAction: 'none'`. A touch starting on a card therefore starts card drag instead of native scrolling.
- Scrolling can start only in narrow gaps around cards. No mobile-specific scroll gesture or test exists.

## implementation details

- Add transparent, mobile-only scroll zones pinned over narrow strips at both edges of `CardView`; keep their width in one named constant.
- Put pointer-drag ownership in a dedicated component. Capture the active pointer, convert vertical movement into `scrollTop` changes on the existing card-columns container, and clear gesture state on pointer up or cancel.
- Keep zones above cards so gestures started there never reach card drag activators. Do not change card dragging, column layout, wheel scrolling, or desktop behavior.
- Clamp scrolling through the container's native `scrollTop` behavior. Zones remain non-semantic and must not hide visible content.
- Add `CardView` tests for both edge zones, scroll direction, pointer cancellation, mobile-only rendering, and unchanged card interaction outside the zones.

## acceptance criteria

- On mobile, dragging vertically from either card-view edge scrolls the card columns in the matching direction.
- Edge scrolling works when cards fill the viewport and no column gap is reachable.
- An edge gesture does not drag, open, or otherwise activate a card.
- Ending or cancelling a gesture stops scrolling; reaching either scroll boundary causes no error or overscroll state.
- Card drag behavior outside the edge zones and all desktop card-view behavior remain unchanged.
