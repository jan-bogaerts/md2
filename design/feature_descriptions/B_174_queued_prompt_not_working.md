---
author: 
id: B_174
internalId: a0687111-dded-4140-8d97-666bd331ddfc
title: queued prompt not working
status: design
owner: 
affects:
agents:
policy:
after: c8c6f7ea-f3f2-4666-91f8-85b895a76302
---
claude agent was running. I needed to steer, so entered a new prompt. this got queued and showed up ok on the screen. but as soon as the agent was done and it's output was written, our queued prompt disappeared and the conversation remains in the `completed` state. I don't think our prompt was sent. something appears to be going wrong in the sequence