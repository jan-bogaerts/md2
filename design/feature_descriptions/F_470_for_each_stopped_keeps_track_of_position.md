---
author: 
id: F_470
internalId: da4aee5d-5816-4fa9-ae35-cdd114954868
title: for-each stopped keeps track of position
status: design
owner: 
affects:
agents:
policy:
---

When we stop a for-each, we continue to show the progress bar. this is ok, but the position is lost, we should keep this so we can find the last position easier again