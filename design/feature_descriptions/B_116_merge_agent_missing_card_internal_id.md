---
author: 
id: B_116
internalId: b0e7104c-8f81-425e-8473-66b569a63d81
title: merge agent missing card internal id
status: design
owner: 
affects:
agents:
policy:
---

When we have a merge conflict and decide to resolve it with an agent, as soon as the agent opens, we get this error:

`Missing cardInternalId for merge-conflict agent conversation context`

there is no card, so no internal id.