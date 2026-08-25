---
author: 
id: F_253
internalId: feaf009d-ccf1-489b-bc6f-b3eca1746831
title: click on search selects and focuses card
status: new
owner: 
affects:
agents:
policy:
after: 526d5eb3-f1f1-4d3e-a65f-a5721d69a23c
---

When user clicks on the result of a global search query and he is on the boards view, one of these things should happen:

* card is on board (so still active, not archived or released): select it (visually show selection) and scroll into view
* card is released or archived: open a popup with the content, read only, but text remains selectable and can be copied