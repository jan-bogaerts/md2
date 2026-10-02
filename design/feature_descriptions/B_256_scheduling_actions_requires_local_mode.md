---
author: 
id: B_256
internalId: 21b6ec8e-0455-42ef-9680-36dd39c52fd5
title: Scheduling actions requires local mode
status: design
owner: 
affects:
agents:
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
---

Tried to schedule an action over websocket. Got this error:

> Scheduling actions requires local mode

This is not correct. The scheduler runs in electron, so it should be possible to schedule the action.