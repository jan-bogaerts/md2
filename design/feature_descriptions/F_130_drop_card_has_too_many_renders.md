---
author: 
id: F_130
internalId: 9df160a1-c669-422b-aea5-da5655c12134
title: drop card has too many renders
status: design
owner: 
affects:
agents:
policy:
after: 
---
it seems when dropping a card, that first the 'drop target' is removed, a full refresh is done to show the drop target is gone, then the card is added and then a final rerender is done. there is a visible glitch.

instead, removing drop target and putting the card in it's new place should be done without renders in between