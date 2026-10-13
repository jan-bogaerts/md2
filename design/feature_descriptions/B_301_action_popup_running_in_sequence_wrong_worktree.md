---
author: 
id: B_301
internalId: 9e01cab5-8f41-4ea9-9ded-d6358a458537
title: action popup running in sequence wrong worktree
status: design
owner: 
affects:
agents:
policy:
---

we recently fixed it so that we show the worktree on the card, in read-only mode when it has an action running within the context of a sequence that also has a worktree assigned.

however, we don't show this on the action popup for the card. there, the icon still says that it is on the main worktree.