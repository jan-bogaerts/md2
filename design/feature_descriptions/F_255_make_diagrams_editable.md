---
author: 
id: F_255
internalId: 9d5878e6-2d20-4574-971d-57dbd82eb389
title: make diagrams editable
status: design
owner: 
affects:
agents:
  - design/activity/card__9d5878e6-2d20-4574-971d-57dbd82eb389.json
policy:
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

* Section edit
  * zoom: in and out
  * Select:
    * Click on surface: draw rect, everithing in rect is selected.
    * Click on node, edge or group: select it
    * Ctrl click: add to selection
    * Drag on node, zdge or group: move around
    * Drag on one of select handlers: resize
    * Delete key: delete selection
    * Double click: edit details
  * Delete: delete selection
  * Cut, copy, paste.
* Node: draw nodes, each node type has button, this is section.
* Edge: draw edges, other section, all edges
* Groups: section, all groups
* Others

I Suppose edges can be dropped anywhere on surface and nodes are between edges, so they must hook up to the connection points of the edges. So edges must have connection points, which should be relative coordinates, perhaps an angle that is converted into coordinates for the nodes.

Sections are tabs on the toolbox

Allow user to resize the toolbox

Services:

* Selection service: maintains list of selected objects