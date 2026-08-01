---
author: 
id: B_80
internalId: e69b9faf-30dd-4ad6-9d99-7e6af4d18c76
title: worktree selector not updated
status: design
owner: 
affects:
agents:
policy:
after: 
worktree: 2
---
after the 'integrate into project' command is run on a card that is assigned to a worktree, the worktree selector icon is not updated and the wrong state is shown on the card. if the user clicks again on the icon and runs the 'integrate into project' again, the app gives an error to say nothing left to integrate. then the icon gets updated correctly

## Current state

`WorktreeSelector` derives its arrows and enabled actions from records published by `WorktreeService`. Integration creates a squash commit on the project branch, but leaves the linked branch on its original commits. Git therefore still reports the worktree as ahead and behind. A second integration rebases away those already-integrated commits, publishes the corrected state, then fails because nothing remains to integrate.

Card integration also commits its activity record after the integration refresh, so that new project commit is absent from the published status.

## implementation details

- After a successful squash, move the clean linked branch to the integration commit before publishing worktree state. Keep its assignment and branch; do not park or unassign it.
- After card activity persistence completes, synchronize the linked branch to the new project head and publish worktree state again.
- Keep project-level integration on the shared synchronization path; it needs no activity refresh.
- Preserve existing integration and activity-persistence errors. If post-integration synchronization fails, report the partial failure and keep the card assigned.
- Add desktop Git and bridge regression tests. Existing renderer subscription should update without component-local state.

## acceptance criteria

- Successful integration immediately removes the outgoing indicator and disables `Integrate into project`.
- Card integration finishes with no outgoing or incoming indicator and disables both integration and update actions.
- Reopening the selector or waiting for polling is unnecessary.
- A second integration is not required to correct the icon and is unavailable when no outgoing changes remain.
- Card and project integrations publish correct final worktree status; failure behavior remains unchanged.
