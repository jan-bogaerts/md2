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
  * Click on node, edge or group: select it
  * Ctrl click: add to selection
  * Drag on node, zdge or group: move around
  * Drag on one of select handlers: resize
  * Delete key: delete selection
  * Double click: edit details
* Section edit
  * Delete: delete selection
  * Cut, copy, paste.
* Node: draw nodes, each node type has button, this is section, section can be collapsed, expanded. Put in reusable toolsSection component
* Edge: draw edges, other section, all edges
* Groups: section, all groups

I Suppose edges can be dropped anywhere on surface and nodes are between edges, so they must hook up to the connection points of the edges. So edges must have connection points, which should be relative coordinates, perhaps an angle that is converted into coordinates for the nodes.

More about section on toolbox: limit size, dont autosize to content. Allow user to resize.

Services:

* Selection service: maintains list of selected objects