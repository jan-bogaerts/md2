---
author: 
id: B_313
internalId: 7fe6eb2d-0bcd-43aa-ba7c-f1fb3ade4a4c
title: prompt to existing converation on worktree failed
status: design
owner: 
affects:
agents:
  - design/activity/card__7fe6eb2d-0bcd-43aa-ba7c-f1fb3ade4a4c.json
policy:
---
I have a card. it was assigned to a worktree, then we started an agent, which ran in the worktree. there were no file changes, so we switched to the primary repository again.

Then I wanted to continue the conversation, but now we get the error: `Failed to sendAssigned worktree branch "f_422_check_if_possible_to_switch_agent_accounts" is unavailable. Select a worktree again.`

This is strange. I don't understand this restriction, it seems over engineered again