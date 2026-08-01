---
author: 
id: B_85
internalId: 56dd54b0-9554-4545-85d4-bb45efef4d6e
title: add the reference to a chatlog to a card as soon as possible
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__56dd54b0-9554-4545-85d4-bb45efef4d6e.json#conversation=agent-f03c3094-abbc-4fc5-a061-a5f004b7aa4a
  - design/activity/card__56dd54b0-9554-4545-85d4-bb45efef4d6e.json#conversation=agent-8e9088cf-eb68-4d7d-9b85-131ebf4fe279
  - design/activity/card__56dd54b0-9554-4545-85d4-bb45efef4d6e.json#conversation=agent-a88e0082-d8e6-48e9-8721-64f9642bf0a7
  - design/activity/card__56dd54b0-9554-4545-85d4-bb45efef4d6e.json#conversation=agent-fdc1c401-34d8-4a9d-824d-df49bcaddfcc
policy:
after: 5cdae748-9597-4d29-8dc0-3d4b5df3aa7f
worktree: 2
---

Do not wait until the agent action finishes to add its conversation reference to the card. Add the reference when the conversation starts.

## Current state

The desktop sends an `agentStarted` update containing the new conversation and its `conversation.path` reference. `AgentIntegration` receives this update but does not add the reference to the card.

The reference is currently added only when the terminal `action` event arrives. If the app closes before that event, the card never receives the reference.

## implementation details

- When `AgentIntegration` receives an `agentStarted` update for a card-scoped action, add `update.conversation.path` to that card's `agents` header through the existing card save path.
- Do not load the conversation from the activity file at this point. The running conversation is already held by `ActionRunRegistry`, and the existing terminal event remains responsible for loading the completed conversation.
- Keep reference insertion idempotent so continuations and the terminal event do not add duplicates.
- Do not change when or how the activity file itself is written.
- Add a regression test showing that `agentStarted` updates the card before any terminal event is received. Keep the existing terminal linking and loading test.

## acceptance criteria

- A card-scoped `agentStarted` update adds the conversation reference to the card immediately, without waiting for completion.
- If the app closes during the conversation after that card save is persisted, reopening the project still shows the reference in the card header.
- A continuation or terminal event does not add the same reference twice.
- Existing activity-file persistence behavior is unchanged.
