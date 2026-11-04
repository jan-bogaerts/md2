---
author: 
id: B_328
internalId: 9b59a42b-9d2e-4dfd-96b1-cbdb7b51fa05
title: stopping a conversation fails
status: ready
owner: 
affects:
agents:
  - design/activity/card__9b59a42b-9d2e-4dfd-96b1-cbdb7b51fa05.json
policy:
after: c9a462cf-7874-4ada-a2f3-df08cf1793b2
changedFiles:
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
---

I have a conversation that is currently in the 'waitingForInput' state. But when I press the `finish conversation` button, nothing happens.

it is very strange, sometimes it works, sometimes it doesn't. If it fails, closing and opening the application fixes it, so it seems to be some broken internal state perhaps?

## Current state

`finishPopupAction` forwards Finish for a live conversation through the Electron bridge to `AgentRunnerService.finish()`. The runner marks the run as finishing and starts shutdown when the turn is idle or waiting for a question.

An approval also changes the conversation to `waitingForInput`, but the active turn remains blocked on the approval. `AgentRunnerService.finish()` does not start shutdown for this state because it checks `waitingForQuestion` instead of the complete pending-interaction state. No later turn-completed event arrives, so the run remains active and the Finish button appears to do nothing. Restarting removes the live run, after which the stored waiting conversation can be completed directly.

## Implementation details

- In `AgentRunnerService.finish()`, start shutdown when `hasPendingInteraction(run)` is true instead of checking only `run.waitingForQuestion`. This covers pending questions and pending approvals through the existing run-state helper.
- Keep the current behavior for an active turn without a pending interaction: mark it as finishing and wait for the turn-completed event before starting shutdown.
- Add a regression test in `desktop/src/actions/agent/agent_runner_state.test.mjs` proving that Finish starts shutdown when an active turn has a pending approval.

## Acceptance criteria

- [ ] Finishing a conversation waiting for an approval starts agent shutdown immediately.
- [ ] Finishing a conversation waiting for a question continues to start agent shutdown immediately.
- [ ] Finishing an idle `waitingForInput` conversation continues to start agent shutdown immediately.
- [ ] Finishing during an active turn without a pending interaction waits for that turn to complete before starting shutdown.
- [ ] The pending-approval regression test and the focused agent runner tests pass.
