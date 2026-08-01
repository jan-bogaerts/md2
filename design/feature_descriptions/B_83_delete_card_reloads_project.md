---
author: 
id: B_83
internalId: 0b35236a-2fe4-4b58-86f8-bd84af5ac7ce
title: delete card reloads project
status: design
owner: 
affects:
agents:
policy:
after: 
---

deleting a card currently reloads the entire project (project\_loading.ts: reloadCurrentProjectSnapshot). this shouldn't be done.