---
author: 
id: F_255
internalId: 9d5878e6-2d20-4574-971d-57dbd82eb389
title: make diagrams editable
status: new
owner: 
affects:
agents:
policy:
after: 526d5eb3-f1f1-4d3e-a65f-a5721d69a23c
---
allow user to split view of diagram:

* current state
* new state

in the new state, the diagram can be changed:

* objects removed, added, changed
* connections removed added and changed
* We keep track of changes made so that we can provide a list of changes, in text, to an agent that will implement these changes.

User can select to see split vertically, hor or in tabs.

on design surface, show floating toolbox: resizable popup (reuse exiting component), hor flex, wrap

Tools:

* Select:&#x20;
  * Click on surface: draw rect, everithing in rect is selected.
  * Click on node or

Services:

* Selection service: maintains list of selected objects