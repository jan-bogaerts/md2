---
author: 
id: F_72
internalId: a1f4148a-3eba-433d-a603-4412a0952e34
title: Scrolling cardview on mobile
status: new
owner: 
affects:
agents:
  - design/activity/card__a1f4148a-3eba-433d-a603-4412a0952e34.json#conversation=agent-a091095c-727b-477a-a134-9b73e98b0bef
policy:
after: e08c4b32-0bff-42a8-9df2-b0df009606ab
---
Scrolling cardview on mobile is tricky. Only small space to drag along edges. Otherwise card drag starts.&#x20;

Solution: add overlay at right and lzft edge that is a bit over the cards. When drag on these overlays: scroll