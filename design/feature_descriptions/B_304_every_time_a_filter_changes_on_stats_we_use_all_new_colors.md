---
author: 
id: B_304
internalId: 9595799d-16df-4378-9d4b-6b604ce606f6
title: every time a filter changes on stats we use all new colors
status: design
owner: 
affects:
agents:
  - design/activity/card__9595799d-16df-4378-9d4b-6b604ce606f6.json
policy:
after: 9e01cab5-8f41-4ea9-9ded-d6358a458537
---

Every time a filter changes, we use different colors for each series in the chart. this is not ok, we should always use the same colors. The same series should always use the same color on every chart, with any filter value.

in other words, remember the colors for each series label.