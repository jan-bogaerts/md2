---
author: 
id: F_95
internalId: e5b95f2c-cd0c-4623-8e12-d0c497447e71
title: integrate into project should track commit
status: design
owner: 
affects:
agents:
policy:
after: d4afff38-5581-42f4-a8f3-8ded807ab27a
---
When a worktree's branch is merged into the main project through the `worktree selector's context menu`, the card should retain the commit id so that the history of the card's code changes can be tracked.

Cards already are able to show commit differences and show a selector to show them. These are for commits that were done automatically after an action that has this feature enabled, was done.&#x20;