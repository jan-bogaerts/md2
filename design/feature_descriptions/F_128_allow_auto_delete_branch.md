---
author: 
id: F_128
internalId: efdaf96e-da6f-4d8f-874f-042f30965276
title: Allow auto delete branch
status: new
owner: 
affects:
agents:
policy:
after: dbf63724-048c-44ff-ae98-534c1b37a68e
---

When we assign a worktree to a card, a branch is auto created.

When that branch is merged back into project´s branch, we currently let the branch be.

The ´integrate into project´ dialog should have a checkbox to ´delete branch´. Last selected value needs to be persisted and restored. When selected, only delete branch after succesful merge.

When a release is done, for all cards that a branch was created and not yet deleted, show a checkbox in the release form so branches can still be deleted after release.

Users should be able to select - unselect all chzckboxes at once. Last selected value should be persisted and restored