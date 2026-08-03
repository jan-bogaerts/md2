---
author: 
id: F_100
internalId: b692b422-3e30-4518-91c1-bcee5451b046
title: when waiting for input timer should stop
status: in progress
owner: 
affects:
agents:
  - design/activity/card__b692b422-3e30-4518-91c1-bcee5451b046.json#conversation=agent-332f2b3e-fd65-4d76-ad55-c2d70f1b9b25
  - design/activity/card__b692b422-3e30-4518-91c1-bcee5451b046.json#conversation=agent-920bd107-7631-4ebb-9c0b-31d6db64d8db
policy:
after: 
worktree: 3
---

on the action popup, when the state is 'waiting for input', the timer should stop counting and only restart again once the input has been provided.

# Current state

`ConversationTimer` receives only `startedAt` and `completedAt`. While `completedAt` is null, it updates every second regardless of action status, so time spent in `waitingForInput` is counted.

`ActionConversationChat` already receives canonical run status and renders timer, but does not pass status to it.

# Implementation details

- Pass run status from `ActionConversationChat` to `ConversationTimer`.
- Keep elapsed value in timer and update it only while status is running.
- On `waitingForInput`, freeze current value and stop interval. On `running`, resume from frozen value.
- Keep completed and uninterrupted-run behavior unchanged. Do not add persistence or backend timing fields.
- Add timer tests for running, waiting, resumed, and completed states.

# Acceptance criteria

- Timer stops changing while run status is `waitingForInput`.
- Providing input changes status to `running`; timer continues from frozen value without counting waiting time.
- Timer remains static after completion.
- Runs that never wait keep current timer behavior.
