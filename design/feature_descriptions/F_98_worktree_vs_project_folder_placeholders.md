---
author: 
id: F_98
internalId: ff356504-eed4-47f3-bb38-2c749b6fcba6
title: worktree vs project folder placeholders
status: new
owner: 
affects:
agents:
policy:
after: 901e1f2a-b0ad-4f79-9aa2-69fb75662cd1
---
We have 'rootProjectFolder' placeholder. this currently maps to the folder that the agent is running on, so it could the the main project folder or a worktree.&#x20;

We need to improve this and split it up in `worktree-folder` and 'project-folder' where the last one always references the main project folder while 'worktree-folder' references the folder that the agent is currently running in.

Also, we need to add the 'releases-folder' as well