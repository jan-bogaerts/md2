---
author: 
id: B_86
internalId: fb78171f-6c8d-4760-8e63-7ac2eff93256
title: Scroll on cardview
status: new
owner: 
affects:
agents:
  - design/activity/card__fb78171f-6c8d-4760-8e63-7ac2eff93256.json#conversation=agent-97ea4269-4ceb-4668-996c-394ef6c17461
  - design/activity/card__fb78171f-6c8d-4760-8e63-7ac2eff93256.json#conversation=agent-a957a84b-06b9-401d-a353-05e3a23df0c2
policy:
after: 58f7a536-89fd-490b-8112-2a850481bf23
---

On mobile, cards view does not scroll. We should already have made a component for this.

## Current state

- `CardView` renders `CardViewScrollZones` on mobile and scrolls its card-columns container from pointer movement at either edge.
- Each transparent zone is only 3 px wide. This is too narrow for reliable touch input, while card surfaces suppress native scrolling for drag-and-drop.
- Existing tests invoke the zones directly and therefore do not expose the unusable touch target.

## implementation details

- Keep `CardViewScrollZones`; widen both zones to the 20 px mobile card-view gutters using one named constant.
- Keep zones above card drag surfaces and preserve existing pointer capture, scroll direction, cancellation, native scroll boundaries, card dragging, and desktop behavior.
- Verify the regression on a mobile viewport. Keep existing interaction tests; do not add a test tied only to the visual width constant.

## acceptance criteria

- On mobile, dragging vertically from either outer card-view gutter reliably scrolls the card columns when cards fill the viewport.
- Edge gestures do not drag, open, or activate cards and stop on pointer up or cancellation.
- Card interaction outside the edge zones and desktop card-view behavior remain unchanged.
