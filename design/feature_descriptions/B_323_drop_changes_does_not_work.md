---
author: 
id: B_323
internalId: dbff8fd6-e09c-4ab4-909b-a2a15429e374
title: drop changes does not work
status: design
owner: 
affects:
agents:
  - design/activity/card__dbff8fd6-e09c-4ab4-909b-a2a15429e374.json
policy:
---

while trying to remove a worktree from a card that tried to do some work, we got a dialog with this request:



Worktree has uncommitted changes
Commit and integrate changes into the project before returning this worktree to its parked state, or permanently drop all tracked and untracked changes.

Commit message



when user selects 'drop changes' we get the error:

> Command failed: git clean -fd
> warning: could not open directory 'detector/.pytest_cache/': Permission denied
> warning: failed to remove detector/.pytest_cache/: Directory not empty

this is not ok.

when user selects `drop changes` just drop the changes. don't try to do something fancy.&#x20;