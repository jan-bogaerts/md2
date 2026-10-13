---
author: 
id: B_297
internalId: b09b6ef5-69c9-414f-bb05-e893f0e79d55
title: action ready state no longer detected
status: design
owner: 
affects:
agents:
  - design/activity/card__b09b6ef5-69c9-414f-bb05-e893f0e79d55.json
policy:
after: 5135bed0-6e69-4e19-9738-467ffdfb7348
---
recent changes have broken the system: the renderer no longer seems to react when the agent is ready and is waiting for input. Maybe this message is no longer sent from desktop to renderer or maybe the action buttons (and run button) no longer monitor or receive the correct event?

we did change something recently to improve speed so that not all cards and / or action popups would monitor 'all changes' but only specific changes, maybe we forgot some?