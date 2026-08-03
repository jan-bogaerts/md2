---
author: 
id: F_135
internalId: 97b845e7-b774-4577-ac95-2af4adc6bd47
title: auto resolve merge conflicts
status: new
owner: 
affects:
agents:
policy:
---

When a worktree is merged back into the project's working branch it can happen that there is a merge conflict. currently we show an error.

What should happen:

* we need a 'resolve merge conflict' action, which is an action, labeled as such, that will be triggered automatically when  merge conflict pops up.
* if the agent is not able to resolve all merge conflicts, show a custom