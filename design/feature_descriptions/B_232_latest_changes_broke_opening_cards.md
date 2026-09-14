---
author: 
id: B_232
internalId: 5c3ce7b1-898e-4a38-b281-0f6fc89e2bb9
title: latest changes broke opening cards
status: design
owner: 
affects:
agents:
  - design/activity/card__5c3ce7b1-898e-4a38-b281-0f6fc89e2bb9.json
policy:
---

opening a card now takes very long. see trace: [Trace-20260914T100720.json](file:///C:/Users/janbo/Documents/dev/Trace-20260914T100720.json): this is just opening and closing a card (in the background, an agent was also running). but you can clearly see big slow down while opening & closing the card. this is not normal I suspect the latest changes (most likely diagrams) has broken something.

what is occurring? why is the open and close taking so long? what is happening that shouldnt?