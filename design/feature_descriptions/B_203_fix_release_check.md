---
author: 
id: B_203
internalId: 3b6ae28a-dbbc-4229-be1b-f9b7ecd00fc1
title: fix release check
status: design
owner: 
affects:
agents:
  - design/activity/card__3b6ae28a-dbbc-4229-be1b-f9b7ecd00fc1.json
policy:
---
we currently get an error like this: `Cannot complete release. Unassign worktrees from cards` for a card that is not in the `release` column. We should not check cards that are not being released.