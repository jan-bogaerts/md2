---
author: 
id: F_137
internalId: 16bc6dc5-0f8e-421d-b0a9-c83d3a3a65f0
title: group toolcalls
status: ready
owner: 
affects:
agents:
  - design/activity/card__16bc6dc5-0f8e-421d-b0a9-c83d3a3a65f0.json#conversation=agent-221e4f2f-03cb-429a-aada-7474d68aabb0
  - design/activity/card__16bc6dc5-0f8e-421d-b0a9-c83d3a3a65f0.json#conversation=agent-a1bd9abf-a336-412a-8715-425236c4f38f
policy:
after: 4aa237a7-a946-4ce7-84ba-962826a44dfa
branch: f_137_group_toolcalls
worktree: 2
---
we need to improve how the conversation log shows the list of toolcalls.

Something similar has already been done for ´agent events´

For tool calls, we need to group all completed toolcalls within a sequence of toolcalls. The still running ones should remain individual boxes.
