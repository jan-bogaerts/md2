---
author: 
id: B_226
internalId: cd3e256b-4d1e-433f-97b9-a662110f1596
title: project agent action buttons no state
status: design
owner: 
affects:
agents:
  - design/activity/card__cd3e256b-4d1e-433f-97b9-a662110f1596.json
policy:
---

the project agent has an action that is waiting for a response. the FAB button correctly shows the state, but then when you open the action popup, no action button shows the same state, so it is confusing. after some digging, one of the actions indeed had a conversation that was 'waitingForInput'.

sometimes this does seem to work however, so I think perhaps it has something to do with the agent running or not?  The situation is currently happening when it is not running