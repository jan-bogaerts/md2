---
author: 
id: F_125
internalId: e6a79155-179c-46bb-b31e-722dffd7ec2e
title: show waitforInput state when agent asked question
status: ready
owner: 
affects:
agents:
  - design/activity/card__e6a79155-179c-46bb-b31e-722dffd7ec2e.json#conversation=agent-812f3b6c-7d5b-4625-b447-b67498854b9f
  - design/activity/card__e6a79155-179c-46bb-b31e-722dffd7ec2e.json#conversation=agent-067adcd1-49e9-4f69-8e7c-c072f2ba71ee
policy:
after: dc388d9d-a25d-4e74-bc32-71325cefa426
---

When the agent is waiting for regular input, we show the `run` button in a special state (orange, with indicator). We should do the same if the agent asked a specific question or asked for permission for something

# Current state

`ActionRun` publishes structured questions and approval requests as `update` events with status `waitingForInput`. `ActionRunRegistry` stores their payloads but does not apply that status to the live run. `CardRunButton` and `ActionSelector` therefore keep showing `running`, because live run status overrides persisted conversation status.

# Implementation details

- In `ActionRunRegistry`, set live run status to `waitingForInput` when receiving `agentQuestion` or `agentApproval` updates.
- Keep existing question/approval storage, answer handling, status priority, and waiting visuals unchanged.
- Cover direct events and recovered active-run events. Add renderer and UI regression tests for questions and approvals arriving without a separate `agentState` event.

# Acceptance criteria

- Structured question immediately changes card `Run` button and matching popup action button to orange waiting state, without running animation.
- Approval request produces same waiting state.
- Waiting state survives popup reopen and active-run recovery.
- Answering question or resolving all approvals restores running state; unresolved interactions keep waiting state.
- Regular waiting, running, terminal, and unseen-result displays remain unchanged.
