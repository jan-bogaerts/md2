---
author: 
id: J_48
internalId: 3e78e609-b7b9-496d-bc72-0826743d5d65
title: diagram zoom
status: new
owner: 
affects:
agents:
policy:
---

we already have a diagram zoom for the editable part of the diagram. we don't yet allow zooming for the non-editable (current-state) version of the diagram. this is annoying. also, the zoom in\&out buttons are not convenient.

we need to refactor the zoom feature:

* allow for both editable as non-editable version. when both are shown, each gets it's own zoom
* zooming is done with a horizontal slider, put slider floating in lower left corner of the diagram