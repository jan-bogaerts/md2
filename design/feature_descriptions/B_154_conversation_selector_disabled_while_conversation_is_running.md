---
author: 
id: B_154
internalId: 8c0611fd-44e8-4f65-bc86-11c26afacc8e
title: conversation selector disabled while conversation is running
status: new
owner: 
affects:
agents:
policy:
after: 10a50270-fcab-4661-9d29-d966aa99eb1e
---

I don't understand why we are doing this. so first we need to investigate if there is a `functional` reason for this. if not, we should allow changing conversations on an action while the action is running. the other conversations are simply not in progress.