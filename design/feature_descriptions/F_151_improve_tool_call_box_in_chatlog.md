---
author: 
id: F_151
internalId: d078e271-bd1a-4a6d-86a0-d9cf3264c7e0
title: improve tool-call box in chatlog
status: new
owner: 
affects:
agents:
policy:
---

in [F\_137\_group\_toolcalls.md](design/releases/0_1_0/F_137_group_toolcalls.md) we already implemented grouping of tool calls in the chatlog. only issue: all tool calls are still in their own box, the boxes are now just aligned so they touch each other.

we don't want that, we just want 1 single box that says:

`tools called` or something similar. This box can be expanded, then we get the individual tools that were called. each individual tool can also be expanded to see the details.