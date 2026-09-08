---
author: 
id: F_342
internalId: 6a4ede44-a6e7-44d0-afdc-3230b6595822
title: diagrams emphasize related objects and connections
status: design
owner: 
affects:
agents:
policy:
---

we need to improve the diagrams a little bit:

* first, for both static and editable diagrams, when clicking on an item: it should select it. for editable diagrams, this is already ok I think, but static diagrams open the context menu. instead, a click should select it, a right click opens the context menu
* we need to add an item to the context menu: emphasize, which changes the diagram by making all non-related object almost fully transparent so that only the selected object and everything that is related to it (nodes and leaves) remain normal.
  to exit this state, user can:
  * press escape
  * click on the X that we show in the right upper corner of the diagram while in this mode.