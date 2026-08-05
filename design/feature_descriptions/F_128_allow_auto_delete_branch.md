---
author: 
id: F_128
internalId: efdaf96e-da6f-4d8f-874f-042f30965276
title: Allow auto delete branch
status: design
owner: 
affects:
agents:
policy:
after: 18fd04d3-5df7-4f54-ab7a-94d96f210f13
---

When we assign a worktree to a card, a branch is auto created.

When that branch is merged back into project´s branch, we currently let the branch be.

The ´integrate into project´ dialog should have a checkbox to ´delete branch´. Last selected value needs to be persisted and restored. When selected, only delete branch after succesful merge.

When a release is done, for all cards that a branch was created and not yet deleted, show a checkbox in the release form so branches can still be deleted after release.

Users should be able to select - unselect all chzckboxes at once. Last selected value should be persisted and restored