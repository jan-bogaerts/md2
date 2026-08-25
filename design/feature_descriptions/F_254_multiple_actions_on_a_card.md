---
author: 
id: F_254
internalId: 427d1b08-b9a7-4933-abbb-16c7e60595e1
title: multiple actions on a card
status: new
owner: 
affects:
agents:
policy:
---

it appears we restrict the number of actions that can run on a card. if 1 action is running and we try to start another one, it will even try to queue the message.

this is all super over engineered, nothing of this is needed, all of these restrictions need to be removed: use should be able to run multiple actions at the same time, even of the same type. keep it simple