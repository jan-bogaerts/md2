---
author: 
id: F_95
internalId: e5b95f2c-cd0c-4623-8e12-d0c497447e71
title: integrate into project should track commit
status: in progress
owner: 
affects:
agents:
  - design/activity/card__e5b95f2c-cd0c-4623-8e12-d0c497447e71.json#conversation=agent-4e6f97b9-647e-49fc-93f7-cf09e5eff1aa
policy:
after: 9ef42f8e-d6f7-4514-8e4a-5555318c4b51
---

## Current state

`WorktreeSelector` integrates an assigned card through `WorktreeService` and the Electron worktree service. The backend checkpoints primary-worktree changes, rebases the card branch when behind, then fast-forwards the project branch. The operation returns no commit metadata.

Card commit history reads tracked `<projectFolder>/activity/card__<cardInternalId>.json` files. Only action executions add commit references, so commits integrated from the selector are absent unless an action already recorded them.

## Implementation details

- Add a card-specific integration request containing `cardInternalId` and `projectFolder`; project-level worktree integration remains untracked.
- After any rebase, squash the card branch's complete change onto the project branch and create one integration commit. Do not fast-forward or retain the card branch's individual commits on the project branch.
- Resolve the integration commit's activity metadata, then append one system activity record containing only that commit and labeled `Integrate into project` to the card's primary-checkout activity file. Do not model it as a user action.
- Commit the activity-file update through the existing serialized activity writer. Return only after both integration and history persistence finish, so existing card-history reload and diff UI show the integration commit.
- If applying or committing the squash fails, restore the primary checkout to its state after the primary-worktree checkpoint and before the squash attempt.
- Failed integration writes no activity record. If integration succeeds but activity persistence fails, report that partial failure clearly; never claim tracking succeeded.

## Acceptance criteria

- Integrating a card worktree with one or several outgoing commits creates and records exactly one squash commit under the card's stable `internalId`.
- The squash commit contains the combined change between the project branch and the rebased card branch. Primary checkpoint and activity-file commits are not included.
- The squash commit appears once under `Integrate into project` in the existing card commit selector and opens one combined diff for the integration.
- Integration with no outgoing commits or no combined change remains rejected and creates no activity record.
- Failed integration creates no activity record. History-persistence failure after a successful squash commit is visible.
- Project-level worktree integration creates no card activity.
- Tests cover one and several source commits producing one squash commit, rebase before integration, stable card ownership, squash cleanup and persistence failure paths, and project-level exclusion.
