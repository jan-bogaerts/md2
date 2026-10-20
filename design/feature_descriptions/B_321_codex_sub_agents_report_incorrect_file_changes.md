---
author: 
id: B_321
internalId: b4209b86-7a2f-497f-a268-13acc153c748
title: codex sub agents report incorrect file changes
status: design
owner: 
affects:
agents:
  - design/activity/card__b4209b86-7a2f-497f-a268-13acc153c748.json
policy:
---

When an action runs an agent, we track the number of lines that were changed and removed. This works ok.

However, when codex runs tasks in parallel, we only seem to show the nr of lines that the root agent changed, not what the sub agents did.

We should show the total lines changed below the action popup's conversation log, across all agents that ran in parallel.