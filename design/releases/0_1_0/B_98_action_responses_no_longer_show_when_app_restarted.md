---
author: 
id: B_98
internalId: b8e6a902-e78b-43d3-9896-e43146873ba5
title: action-responses no longer show when app restarted
status: ready
owner: 
affects:
agents:
  - design/releases/0_1_0/card__b8e6a902-e78b-43d3-9896-e43146873ba5.json#conversation=agent-b3dab3c8-7f99-4dda-af57-05cde26be3a3
  - design/releases/0_1_0/card__b8e6a902-e78b-43d3-9896-e43146873ba5.json#conversation=agent-e750a2db-21b5-47f8-b3a7-26057d84435c
policy:
after: 18fd04d3-5df7-4f54-ab7a-94d96f210f13
---

app restarted, so agent is no longer running, but the action was waiting for input from the user and it had responses (phrases) defined, yet they are not showing. this is not correct.&#x20;

## Current state

After restart, `ActionConversationStore` selects latest persisted `waitingForInput` conversation for action and card or project context. Chat and bottom-row controls use that selected conversation, so user can send input, stop, or finish it without old agent process.

`ActionPhraseButtonsOwner` instead shows predefined phrases only when live `ActionRunRegistry` status is `waitingForInput`. Restart removes live run, so phrases stay hidden even though selected persisted conversation can continue.

## implementation details

- Derive phrase visibility from live run when one is active. Otherwise, use selected persisted conversation status from existing `ActionConversationStore`.
- Keep phrases hidden until conversation load completes, unless live run already waits for input. Show them only for agent actions with non-empty `phrases` and effective status `waitingForInput`.
- Keep existing phrase actions: single click replaces prompt draft; double click starts continuation from selected conversation path. Hide phrases when continuation becomes queued or running, then show them again if agent waits for more input.
- Add popup regression coverage for restart-loaded waiting conversation. Preserve live-run, action/context scoping, command-action, empty-phrase, and non-waiting behavior.

## acceptance criteria

- After restart, opening agent action with predefined phrases and persisted `waitingForInput` conversation shows phrase buttons after conversation loads.
- Phrase visibility uses conversation belonging to opened action and card or project context; waiting conversation from another action or context does not show them.
- Single click places phrase text in prompt. Double click continues selected persisted conversation from its saved path.
- Phrase buttons hide while continuation is queued or running and return if conversation waits for more input.
- Agent actions without phrases, command actions, and completed, cancelled, failed, or unselected conversations show no phrase buttons.
- Existing live `waitingForInput` behavior remains unchanged.
