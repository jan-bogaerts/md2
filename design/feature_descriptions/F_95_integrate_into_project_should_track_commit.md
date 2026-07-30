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
after: 
---

## Current state

`WorktreeSelector` integrates an assigned card through `WorktreeService` and the Electron worktree service. The backend checkpoints primary-worktree changes, rebases the card branch when behind, then fast-forwards the project branch. The operation returns no commit metadata.

Card commit history reads tracked `<projectFolder>/activity/card__<cardInternalId>.json` files. Only action executions add commit references, so commits integrated from the selector are absent unless an action already recorded them.

## Implementation details

- Add a card-specific integration request containing `cardInternalId` and `projectFolder`; project-level worktree integration remains untracked.
- After any rebase and before fast-forwarding, capture all commits with `git rev-list --reverse <project-branch>..<worktree-branch>`.
- Fast-forward the project branch, resolve each captured commit's existing activity metadata, then append one system activity record labeled `Integrate into project` to the card's primary-checkout activity file. Do not model it as a user action.
- Commit the activity-file update through the existing serialized activity writer. Return only after both integration and history persistence finish, so existing card-history reload and diff UI show the commits.
- Failed integration writes no activity record. If integration succeeds but activity persistence fails, report that partial failure clearly; never claim tracking succeeded.

## Acceptance criteria

- Integrating a card worktree records every newly integrated commit once, oldest first, under the card's stable `internalId`.
- Rebased commit hashes are captured after the rebase; primary checkpoint and activity-file commits are not included.
- Recorded commits appear under `Integrate into project` in the existing card commit selector and open the existing diffs.
- Clean integration with no outgoing commits remains rejected and creates no activity record.
- Failed integration creates no activity record. History-persistence failure after a successful fast-forward is visible.
- Project-level worktree integration creates no card activity.
- Tests cover one and several commits, rebase before integration, stable card ownership, failure paths, metadata order, and project-level exclusion.
