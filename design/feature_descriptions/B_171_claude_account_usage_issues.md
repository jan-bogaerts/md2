---
author: 
id: B_171
internalId: f790586e-149f-4338-8f8e-ad90bcdc1b12
title: claude account usage issues
status: design
owner: 
affects:
agents:
policy:
---

We have a polling system that retrieves the claude account usage from the cli. this sort of works.

Here is the problem: it only begins to work after i manually started claude cli and ran `/usage` myself. Then our poller is also able to get the values.

if it can't get a value, it appears to die silently. we need to improve this so that we at least have some console.error or console.warning logs.

Also, i am wondering if it has anything to do with timing. I have the impression that, when running 'claude' and then input '/usage' in the cli, it takes just a fraction of a second, the screen flickers. second time it is faster. perhaps this is our issue?