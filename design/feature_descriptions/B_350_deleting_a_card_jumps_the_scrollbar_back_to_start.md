---
author: 
id: B_350
internalId: ab825e36-710b-4c16-bd2c-59dad2825fb4
title: deleting a card jumps the scrollbar back to start
status: design
owner: 
affects:
agents:
policy:
---

When a column is long and we scrolled down to a card and delete that card again, it seems we do a full re-render of the card view instead of only the column that changed.

This alone should already prevent the bad scroll behavior.