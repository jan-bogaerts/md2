---
author: 
id: F_167
internalId: a75df9b2-d7eb-48df-ba8a-398fac272f15
title: Fix broken activity files.
status: design
owner: 
affects:
agents:
  - design/activity/card__a75df9b2-d7eb-48df-ba8a-398fac272f15.json#conversation=agent-0baac265-01c1-46fa-b6e8-b3c6b6902ecc
policy:
---
Currently, when the system loads the activity files and there is a problem, like an old version it cant load, the app shows an error and doesnt fix it. So next time project opens, same error.&#x20;

Better if the app tries to fix things:

* If agent ref in card cant be found, remove ref from card.
* If old version, load as much as possible, revert to defaults otherwise.

If this needs to be done, make certain that saving and commiting the changes is done in 1 batch.