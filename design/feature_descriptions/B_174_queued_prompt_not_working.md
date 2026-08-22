---
author: 
id: B_174
internalId: a0687111-dded-4140-8d97-666bd331ddfc
title: queued prompt not working
status: new
owner: 
affects:
agents:
policy:
after: db4400c0-0d7f-4265-8939-8b4e493c7208
---
claude agent was running. I needed to steer, so entered a new prompt. this got queued and showed up ok on the screen. but as soon as the agent was done and it's output was written, our queued prompt disappeared and the conversation remains in the `completed` state. I don't think our prompt was sent. something appears to be going wrong in the sequence