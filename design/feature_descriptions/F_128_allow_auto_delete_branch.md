---
author: 
id: F_128
internalId: efdaf96e-da6f-4d8f-874f-042f30965276
title: Allow auto delete branch
status: ready
owner: 
affects:
agents:
  - design/activity/card__efdaf96e-da6f-4d8f-874f-042f30965276.json#conversation=agent-74368566-29db-40ee-bab9-299acbddbe92
  - design/activity/card__efdaf96e-da6f-4d8f-874f-042f30965276.json#conversation=agent-e56a1e1a-42e8-4ce0-a3b3-0ad3c43838bc
policy:
after: 451ece87-dccb-44dd-9783-a22c2709a8e2
worktree: 1
---

When we assign a worktree to a card, a branch is auto created.

When that branch is merged back into project´s branch, we currently let the branch be.

The ´integrate into project´ dialog should have a checkbox to ´delete branch´. Last selected value needs to be persisted and restored. When selected, only delete branch after succesful merge.

When a release is done, for all cards that a branch was created and not yet deleted, show a checkbox in the release form so branches can still be deleted after release.

Users should be able to select - unselect all chzckboxes at once. Last selected value should be persisted and restored
