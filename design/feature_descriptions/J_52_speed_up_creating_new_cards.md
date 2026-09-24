---
author: 
id: J_52
internalId: d35077d6-dd5e-4bba-a00b-ad28b7e7df70
title: speed up creating new cards
status: design
owner: 
affects:
agents:
  - design/activity/card__d35077d6-dd5e-4bba-a00b-ad28b7e7df70.json
policy:
---

analyze this performance trace: [Trace-new card.json](file:///C:/Users/janbo/Documents/dev/Trace-new%20card.json), which was taken while creating a new card. it takes a long time and it appears a lot is done, which is strange cause it should be a fairly simple operation. only 1 column should reresh.