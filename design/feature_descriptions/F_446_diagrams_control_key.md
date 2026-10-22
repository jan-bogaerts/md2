---
author: 
id: F_446
internalId: 1a8109e1-2ead-482d-b6d0-c34fd94c0270
title: diagrams control key
status: design
owner: 
affects:
agents:
  - design/activity/card__1a8109e1-2ead-482d-b6d0-c34fd94c0270.json
policy:
---

When user is working with the select tool he can click on items which selects them or he can draw a box which selects the items in the box. this works ok.

However, the system does not respond to the ctrl key. when this is pressed and the user clicks on another item or draws another selection box, then the newly selected items should be added to the already selected items and not replace them.