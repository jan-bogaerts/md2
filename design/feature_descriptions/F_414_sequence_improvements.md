---
author: 
id: F_414
internalId: 0c0b067b-4eb0-4e90-b31c-ef53afcdbad0
title: sequence improvements
status: design
owner: 
affects:
agents:
  - design/activity/card__0c0b067b-4eb0-4e90-b31c-ef53afcdbad0.json
policy:
---

* adding a sequence is similar as cards, actions, diagrams: add the button there, not on the run tab
* the popup must be floating and take part of the popup stack like other popups (action, card). otherwise the drag-drop feature used on the sequence popup simply doesnt work
* a sequence need to be assignable to a worktree. all cards and actions run in that worktree.
  * a card that is already assigned to a worktree can't be added to the sequence
* when the sequence is executing the actions in the worktree, it needs to:
  * create a branch that represents the full sequence
  * create a new branch for each card/action that it runs, this starts from the sequence-branch.
  * after a card/action is done, it's branch is merged back into the sequence-branch\
    This should allow us to track the changes done for that card, like we have now when we merge the worktree back into the main repository
  * at the end of the sequence, the sequence-branch is the active branch, sub branches should be removed.