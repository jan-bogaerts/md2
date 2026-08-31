---
author: 
id: B_202
internalId: 25d602ba-1743-4365-b35d-08224cd0b98e
title: queued messages work incorrectly
status: design
owner: 
affects:
agents:
  - design/activity/card__25d602ba-1743-4365-b35d-08224cd0b98e.json
policy:
---

it seems that the system will only try to send the next queued message after the agent fully completed it's turn. it is not possible to send it while the agent is still doing something. we need to fix this.