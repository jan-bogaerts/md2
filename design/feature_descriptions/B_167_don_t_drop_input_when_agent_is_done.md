---
author: 
id: B_167
internalId: 55de27a5-aa12-4048-9990-970a8382c5b2
title: don't drop input when agent is done
status: design
owner: 
affects:
agents:
policy:
---

I already had this several times and is ultra ultra annoying: I am typing in some text when the agent finishes (any state: waitingForInput, completed,..). this just cleans the entire input.

it also appears to cause a reload of the entire popup which is overkill and wrong behaviour.&#x20;

find why it is doing this and propose a solution