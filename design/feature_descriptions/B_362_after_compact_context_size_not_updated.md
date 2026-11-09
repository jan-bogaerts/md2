---
author: 
id: B_362
internalId: ba21cf2c-06f9-4210-aeb5-203d3d6c934d
title: after compact context size not updated
status: design
owner: 
affects:
agents:
policy:
---

We did a compact on a conversation with the codex agent. this went ok, but after the operation, the context size indictor still indicated the same size.

we should try to update this somehow, or if there is no valid data available after a compact, set it to 0 temporarily