---
author: 
id: F_339
internalId: 2f6108ac-7b47-4374-a2c6-292b5871b064
title: improve time reporting
status: new
owner: 
affects:
agents:
policy:
after: c6100c77-b4ed-44ab-b53d-7770c01b8656
---

we currently keep track how long a conversation runs. we should improve this measurement and include how much time was spend running tools and then the rest. this way, we can see how much time was actually used by the agent itself.