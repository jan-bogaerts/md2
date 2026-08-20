---
author: 
id: F_204
internalId: 8f424f6d-34f3-4dc5-87ec-0d266b0780f5
title: go to running action on action popup
status: design
owner: 
affects:
agents:
policy:
---
When opening an action popup and there is an action running, go to that action. if there are multiple running, go to the first running, if non are running, check if any is waitingForInput or is ready and has an unread conversation, if so, go to first of that, otherwise go to first in list