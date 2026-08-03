---
author: 
id: F_107
internalId: a529defa-f2ad-4307-923b-856a8ce80243
title: steering prompts disappear
status: new
owner: 
affects:
agents:
policy:
after: f9129167-19a8-4d52-8478-00f1423553d7
---

When an agent is running and we send a steering prompt to it, the prompt just disappears until the backend reports back that it has been sent. this is super annoying.

instead, we should put it in a wait queue, shown visually on the ui by already adding the prompt to the chatlog, but in a 'in transit' state, with a button to 'steer' which should send it immediately.  Otherwise, the prompt will be sent after the next waitforInput state