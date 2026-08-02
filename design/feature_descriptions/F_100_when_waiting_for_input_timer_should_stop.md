---
author: 
id: F_100
internalId: b692b422-3e30-4518-91c1-bcee5451b046
title: when waiting for input timer should stop
status: new
owner: 
affects:
agents:
  - design/activity/card__b692b422-3e30-4518-91c1-bcee5451b046.json#conversation=agent-332f2b3e-fd65-4d76-ad55-c2d70f1b9b25
policy:
after: 
---

on the action popup, when the state is 'waiting for input', the timer should stop counting and only restart again once the input has been provided.