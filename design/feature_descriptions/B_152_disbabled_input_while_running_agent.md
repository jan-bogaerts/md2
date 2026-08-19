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
---

an agent was running, we sent a steering prompt while the agent was still running. first one went ok. but then, the 'send' button remained disabled after typing in some text in the input button (a recurring issue, clearly the state of the send button is still calculated incorrectly. it should be super simple: text in the input box, then enable the send button).

we also got this error after trying to send it with ctrl+enter: `Queued agent prompt is empty`****  which makes me think we can't queue more then 1 prompt and aren't showing that prompts are queued.

then after closing the action popup and re opening it, the input box was just disabled. perhaps because the system thought there was still something in a queue? anyway, this is wrong behaviour.