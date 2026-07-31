---
author: 
id: B_84
internalId: 45c37a4d-b7a0-4bca-9d19-f496ee0a8b81
title: column dop target does not accept drop at top
status: new
owner: 
affects:
agents:
policy:
---

When a card is dragged to the end of a column, an 'empty drop target' is shown to show where the card would be when dropped. this works fine, however, if the card is dragged over the upper half of this 'end of list' target, the drop target moves up 1 card, so I think there is still this 50/50 rule used (upper half moves to above, lower half drops at the same location). we changed that behavior for normal cards, but apparently not for this drop target, so that should be fixed.