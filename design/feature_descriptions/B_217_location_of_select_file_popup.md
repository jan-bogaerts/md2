---
author: 
id: B_217
internalId: 3a81bbba-94cd-4b06-9c53-198d765510b9
title: location of select file popup
status: new
owner: 
affects:
agents:
policy:
---

We have already done some work on this, but it is not yet ok: when we type the 'at' char in the markdown editor, we show a popup with a list of files out of which the user can select a file.

All this works ok, except for the location of the popup, it is too far from the cursor. I think we have a coordinate space issue where we are not converting correctly from or to child or parent coordinate space. we should fix this.