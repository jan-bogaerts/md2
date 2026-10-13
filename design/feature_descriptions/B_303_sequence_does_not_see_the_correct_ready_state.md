---
author: 
id: B_303
internalId: 54a27abd-2174-4b6a-b688-ed2352c50856
title: sequence does not see the correct ready state
status: design
owner: 
affects:
agents:
policy:
after: 06697134-10b3-44b2-a8c6-e35881b33f56
---

Most likely the sequence scheduler is monitoring the file in the worktree and not the one in the main repository. this is where the change will occur.