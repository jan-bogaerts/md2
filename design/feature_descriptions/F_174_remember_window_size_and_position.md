---
author: 
id: F_174
internalId: fc4322fa-2432-4365-b355-32cf5e6e6af2
title: remember window size and position
status: new
owner: 
affects:
agents:
  - design/activity/card__fc4322fa-2432-4365-b355-32cf5e6e6af2.json#conversation=agent-60298020-1cf7-4834-8407-f2744e773b82
policy:
after: bee2d3c7-81e1-451a-bc4d-d4ba59c849e9
---

When the electron app closes, we should save the window state, position and size so we can restore the settings when the app starts the next time.

This only needs to be done for the electron app.

there should be libraries that do this already for us.