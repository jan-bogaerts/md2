---
author: 
id: F_169
internalId: d7bd3d2f-ec5c-4025-879a-5a715e2b4ffc
title: Send btn Small screen action popup
status: new
owner: 
affects:
agents:
  - design/activity/card__d7bd3d2f-ec5c-4025-879a-5a715e2b4ffc.json#conversation=agent-fb537e79-a0f5-4267-9deb-4bbf38c1ffee
policy:
---
When the screen is small, like mobile, on the action popup, the buttons on the bottom row are not visible. The screen is too narrow. When flip phone horizontal, buttons are there. I think problem is only 2 places in grid. Should be flex like on normal width.

To make more room for the buttons at the bottom of the action popup, when in small screen, use l, m, h, instead of low medium high. Also when narrow, the middle section (tokens, changes, lines) should shrink. Drop labels. Use style and colors.