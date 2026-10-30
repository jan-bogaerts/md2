---
author: 
id: B_324
internalId: 0744fffe-c0d8-4265-b945-ab88ba279702
title: legend does not allow multiple entires of same type
status: design
owner: 
affects:
agents:
  - design/activity/card__0744fffe-c0d8-4265-b945-ab88ba279702.json
policy:
---
error message: Add legend entry rejected: `meta.legend has duplicate entry for connection:connection`

I think we have tried to fix this before: it should be possible to add multiple entries of the same kind of diagram object to the legend. so 2 types of connections should be allowed. Diagram objects should refer to the legend entries, not to the node kinds directly.