---
author: 
id: B_189
internalId: c8c6f7ea-f3f2-4666-91f8-85b895a76302
title: cancel new card breaks input
status: design
owner: 
affects:
agents:
policy:
---

We already looked at this before but it remains broken:

[B\_123\_cancel\_new\_card\_breaks\_input.md](design/releases/0_4_0/B_123_cancel_new_card_breaks_input.md)

this is super annoying. And apparently we don't need to fully cancel. so what happens:

* open add new card
* accidentally click outside of card which shows the prompt that asks to cancel the new card
* do not cancel the new card, so cancel the cancel
* finish card, save and close it
* open another card popup: no longer possible to focus an editor and start typing