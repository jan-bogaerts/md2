---
author: 
id: B_85
internalId: 56dd54b0-9554-4545-85d4-bb45efef4d6e
title: add the reference to a chatlog to a card as soon as possible
status: ready
owner: 
affects:
agents:
policy:
after: e5b95f2c-cd0c-4623-8e12-d0c497447e71
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
