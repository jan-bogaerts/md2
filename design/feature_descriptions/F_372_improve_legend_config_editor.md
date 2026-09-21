---
author: 
id: F_372
internalId: c06d609b-025a-4540-a69a-ad451e272b15
title: Improve legend config editor
status: design
owner: 
affects:
agents:
  - design/activity/card__c06d609b-025a-4540-a69a-ad451e272b15.json
policy:
---
Through the items on the legend on the diagrams  it is possible to configure the style of the items. When hovered over item, it show a gear, this opens a popup with config fields like font, size, color, fill, border. There is however little info on the popup (labels, helper text). And rhe inputs are not ok.

We already created a custom color picker, lets reuse this for colors. Use sliders for numbers,...