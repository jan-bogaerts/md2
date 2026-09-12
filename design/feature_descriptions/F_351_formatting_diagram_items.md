---
author: 
id: F_351
internalId: 19a0dd49-b8f7-4dbb-a6a6-eb515260dacd
title: Formatting diagram items
status: design
owner: 
affects:
agents:
  - design/activity/card__19a0dd49-b8f7-4dbb-a6a6-eb515260dacd.json
policy:
---
We need to add the ability to modify formatting of the items on the diagrams. This can be done by:

* When mouse is over legend item, show gear icon. This opens a popup with formatting inputs on.
* On diagram menu tab:
  * Increase, decrease font size
  * Increase, decrease size of boxes (in %)
  * Space closer or further appart.

Formatting inputs:

* Font: family, size, bold, italic, underline, color
* Box:
  * Border: color, style, thickness corner radius
  * Center: fill color, layout pos: top, left, bottom, center, top  right.
* Connections:
  * Line: thickness, color
  * Connection start and end style (arrow, ...)

Formatting can be done on editable and readonly diagrams.

Formatting info is saved in diagram json. Regular commit batcher is used.