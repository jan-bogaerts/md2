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
after: cd9535f0-5c2f-4544-a485-c37091c9b3f0
---
claude agent was running. I needed to steer, so entered a new prompt. this got queued and showed up ok on the screen. but as soon as the agent was done and it's output was written, our queued prompt disappeared and the conversation remains in the `completed` state. I don't think our prompt was sent. something appears to be going wrong in the sequence