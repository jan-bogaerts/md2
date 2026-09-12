---
author: 
id: B_230
internalId: 02127bb8-87e9-4515-89b9-103550e2d125
title: Diagram breadcrumbs not working
status: design
owner: 
affects:
agents:
  - design/activity/card__02127bb8-87e9-4515-89b9-103550e2d125.json
policy:
after: 3ca60eff-65bc-44d0-929f-451e034102c4
---
The breadcrumbs bar on the diagram view needs fixing:

* The first item is disabled. It should never be disabled. Currently there are even multiple root diagrams available (architecture, dependecies), but it is still disabled. At the very least there should be a ´´ew´ menu item which sows the action popup with the next not yet run root action selected.
* Back button should be icon, no text.
* There needs to be a + icon at the end of the list , enabled when something is selected in the diagram. Click opens action popup with child actions on selected
* The bar is currently above the diagram. It should be on top  but inside the view. No background panel, just the bar.