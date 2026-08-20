---
author: 
id: B_152
internalId: 038937d3-b99c-4dfd-b1da-76c906c5c31c
title: disbabled input while running agent
status: new
owner: 
affects:
agents:
policy:
after: 10a50270-fcab-4661-9d29-d966aa99eb1e
---
an agent was running, we sent a steering prompt while the agent was still running. first one went ok. but then, the 'send' button remained disabled after typing in some text in the input button (a recurring issue, clearly the state of the send button is still calculated incorrectly. it should be super simple: text in the input box, then enable the send button).

we also got this error after trying to send it with ctrl+enter: `Queued agent prompt is empty`\*\*\*\*  which makes me think we can't queue more then 1 prompt and aren't showing that prompts are queued.

then after closing the action popup and re opening it, the input box was just disabled. perhaps because the system thought there was still something in a queue? anyway, this is wrong behaviour.

I think the primary problem was that there was something in the queue and we were not giving any visual queue that something was in a queue (so no way to remove from queue either) and we incorrectly prevented multiple items to be queued

So, if items in queue, show those messages at bottom of chatlog, marked as queued with option to delete or edit