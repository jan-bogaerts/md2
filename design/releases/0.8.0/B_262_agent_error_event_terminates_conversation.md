---
author: 
id: B_262
internalId: 97de33fa-4c53-4b0e-a70b-d4266403c8c9
title: agent error event terminates conversation
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.0/card__97de33fa-4c53-4b0e-a70b-d4266403c8c9.json
policy:
after: 977e97f1-1590-48d6-ae9e-6a74808b24d2
---

we got an 'unknown agent event': `Malformed agent conversation: timer.breakdown exceeds timer.elapsedMs`

and now the conversation just stopped.

first, what does this error mean?

second, why did the conversation stop? if we deliberately killed it, then this is wrong.