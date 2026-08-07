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
after: d47986a5-1380-4dd1-adb9-fff106a9a143
---

When an agent is running and we send a steering prompt to it, the prompt just disappears until the backend reports back that it has been sent. this is super annoying.

instead, we should put it in a wait queue, shown visually on the ui by already adding the prompt to the chatlog, but in a 'in transit' state, with a button to 'steer' which should send it immediately.  Otherwise, the prompt will be sent after the next waitforInput state