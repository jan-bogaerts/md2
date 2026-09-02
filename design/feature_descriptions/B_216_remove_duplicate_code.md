---
author: 
id: B_216
internalId: 7037a625-d650-4574-b1d5-874d90ba82a4
title: remove duplicate code
status: design
owner: 
affects:
agents:
policy:
---
seems that we have some duplicate stuff in [action\_scheduler\_service.js](desktop/src/actions/action/action_scheduler_service.js),  `DEFAULT_DIAGRAM_FOOTER` is already outdated.

we need to remove duplications and perhaps clean up this file a little.