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
---

Tried to schedule an action over websocket. Got this error:

> Scheduling actions requires local mode

This is not correct. The scheduler runs in electron, so it should be possible to schedule the action.