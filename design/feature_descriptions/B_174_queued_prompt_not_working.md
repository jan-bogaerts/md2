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
after: 427d1b08-b9a7-4933-abbb-16c7e60595e1
---
claude agent was running. I needed to steer, so entered a new prompt. this got queued and showed up ok on the screen. but as soon as the agent was done and it's output was written, our queued prompt disappeared and the conversation remains in the `completed` state. I don't think our prompt was sent. something appears to be going wrong in the sequence