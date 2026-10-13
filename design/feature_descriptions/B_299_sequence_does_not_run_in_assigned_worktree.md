---
author: 
id: B_299
internalId: 5135bed0-6e69-4e19-9738-467ffdfb7348
title: sequence does not run in assigned worktree
status: design
owner: 
affects:
agents:
  - design/activity/card__5135bed0-6e69-4e19-9738-467ffdfb7348.json
policy:
after: dc18bd32-58a2-4426-99ce-c79309619b03
---

The agent was not started in the worktree that was assigned to the sequence.

* the prompt was not built in the context of the assigned worktree
* the card did not show it was assigned to the worktree.

## Findings

The saved sequence selected `dev3`. Its agent conversation records `dev3` as the command working directory, and `{{worktree-folder}}` resolved to `dev3` in the prompt. The card path in the prompt resolves through `{{repository-folder}}` to the primary checkout, where the agent must read and update the card. Keep that prompt behavior.

The card indicator reads the card's persistent worktree assignment. A sequence instead stores its selected checkout on the schedule. Assigning the checkout to the card would conflict with the sequence's branch ownership and expose the card's normal commit, update, integrate, and discard controls.

## Agreed behavior

Show the running sequence's checkout on its current card as a read-only worktree indicator derived from the sequence record. Disable the worktree controls. The tooltip explains that the card is running within a sequence and that this is why the controls are disabled. The indicator disappears when the sequence advances, completes, fails, or is cancelled. Do not write a persistent card worktree assignment or change the prompt.
