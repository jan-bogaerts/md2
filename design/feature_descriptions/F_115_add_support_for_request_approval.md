---
author: 
id: F_115
internalId: 7bdf27fc-963c-4545-83e2-93410e67f0e3
title: add support for request approval
status: design
owner: 
affects:
agents:
  - design/activity/card__7bdf27fc-963c-4545-83e2-93410e67f0e3.json#conversation=agent-3a1c3e32-614b-426e-b476-f352de7635ae
policy:
after: 
---
The codex agent can produce an output like:

protocal request: `item/fileChange/requestApproval: unknown (exec-46fccecb-72c1-42ab-ba24-0a391ca50e87)`

We get stuck on this: the UI doesn't allow to approve the request, the agent doesn't receive any approval and is stuck. we should implement this more correctly.