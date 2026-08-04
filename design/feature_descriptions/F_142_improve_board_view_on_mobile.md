---
author: 
id: F_142
internalId: 5205bb65-078a-411a-9647-0796ad14953c
title: improve board view on mobile
status: design
owner: 
affects:
agents:
  - design/activity/card__5205bb65-078a-411a-9647-0796ad14953c.json#conversation=agent-3091898f-7991-40fd-b485-6c737add8a11
policy:
after: 
---

We need to improve the board view on mobile to make it usable:

* instead of showing every column below each other on the same, long workspace, we should only show 1 column. Which column is shown, is selected from the hamburger- menu.
* on mobile, by default, cards should not be draggable. when the user swipes vertical, it should be handled by the underlying box (workspace?) and perform a scroll (default scroll behavior), so cards should not capture mouse/finger events.
* when the user does a `long-push` on a card, the board switches to 'drag' mode so that the card captures mouse/finger events again and the drag can begin.

Implementation wise: we should not try to put this all in the same workspace, instead we should have something specific for mobile which only shows 1 column. which column it shows is controlled through a service (standard pattern: service has prop & raises events, menu items set, column updates.

we also need to remove the custom 'drag' gutter components that we created, they don't work properly