---
author: 
id: B_302
internalId: 06697134-10b3-44b2-a8c6-e35881b33f56
title: worktree assigned to sequence appears available
status: design
owner: 
affects:
agents:
  - design/activity/card__06697134-10b3-44b2-a8c6-e35881b33f56.json
policy:
after: 9e01cab5-8f41-4ea9-9ded-d6358a458537
---

we assigned a worktree to a sequence, but the worktree still appears as available in the popup used by the cards to assign a worktree (and likely that of actions as well).

The user should not be allowed to select an already used worktree. so if the worktree is assigned to a sequence, it should be disabled, like usual.

Note: this is most likely best done in the service that manages the available worktrees.