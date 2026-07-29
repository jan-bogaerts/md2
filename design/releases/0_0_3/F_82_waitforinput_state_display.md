---
author: 
id: F_82
internalId: bd965ac0-8031-4f9e-a80d-0cdc1bcfa0c6
title: WaitForInput state display
status: ready
owner: 
affects:
agents:
  - design/activity/card__bd965ac0-8031-4f9e-a80d-0cdc1bcfa0c6.json#conversation=agent-fb8c1984-26f0-43ae-aa06-e40d455b50ea
  - design/activity/card__bd965ac0-8031-4f9e-a80d-0cdc1bcfa0c6.json#conversation=agent-be70f6b2-2953-4148-83c2-93601ecfd38d
policy:
after: e08c4b32-0bff-42a8-9df2-b0df009606ab
worktree: 2
---

# Goal

When a streaming-agent goes into 'WaitForInput' state, the card action button and buttons on the action popup should no longer show 'running' state, but 'waitForInput' state so that the user knows he needs to look at the card.

# Current state

`waitingForInput` already exists in desktop execution events, renderer execution state, and persisted agent conversations. `CardRunButton` recognizes waiting conversations and shows a warning-colored outline and help icon without its running spinner.

Live card state can still appear as running until conversation data refreshes because the button does not read `runningExecution.status`. `ActionPopup` reduces all active executions to `runningActionIds`; `ActionSelector` therefore shows a primary-colored running spinner and “Agent is running” for waiting actions.

# Implementation details

- Use canonical `waitingForInput` status from `ActionExecutionService`; do not infer it from output text.
- Make `CardRunButton` prefer live execution status, with conversation state as persisted fallback.
- Pass each active root action's status from `ActionPopup` to `ActionSelector` instead of only running ids.
- Render waiting buttons with theme `warning.main`, a waiting/help affordance, “Agent is waiting for input” tooltip/accessibility text, and no running animation.
- Keep priority `waitingForInput` over `running`, then unseen result.
- Add focused tests for card button and popup action-button transitions.

# Acceptance criteria

- Waiting streaming agent changes its card action button from running animation to warning waiting state.
- Corresponding action button in open popup shows same waiting state and accessible description.
- Waiting state remains visible after popup reopen and renderer recovery.
- Sending or answering input restores running state; terminal completion removes active state.
- Other running actions keep current running display; unseen-result display remains unchanged.
- Tests cover live execution status, persisted conversation fallback, popup display, and state transitions.
