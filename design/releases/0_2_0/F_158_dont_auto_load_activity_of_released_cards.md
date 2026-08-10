---
author: 
id: F_158
internalId: 705b887c-4aac-4558-bfef-a5cb965f8719
title: dont auto load activity of released cards
status: ready
owner: 
affects:
agents:
  - design/releases/0_2_0/card__705b887c-4aac-4558-bfef-a5cb965f8719.json#conversation=agent-3d7d9996-898c-45a3-845b-d74b2a8f4bc0
  - design/releases/0_2_0/card__705b887c-4aac-4558-bfef-a5cb965f8719.json#conversation=agent-a59bcab4-087e-4d82-9468-ff52b1b9411f
policy:
after: a529defa-f2ad-4307-923b-856a8ce80243
---

We should only load activity of a released card on demand: when the user looks at it somehow.

The activities of the project agent and of active cards should be the only auto loaded activities.

## Current state

`ProjectLoading` first loads active cards, then loads all project Markdown files in the background. Both passes call `AgentIntegration.loadAgentConversationsInBackground`. `cardsForAgentConversationLoading` includes active cards plus every card under the configured archived and releases folders, so opening or refreshing a project reads all referenced historical activity files even when no historical card is viewed.

Card action popups obtain history through `DataService.listAgentConversations`. Card contexts currently return only conversations already cached by `AgentIntegration`; this works for released cards only because project loading filled that cache. Project-agent history follows a separate path: its activity references are listed and loaded when the project-agent popup asks for them.

Here, **automatic load** means reading activity during project open or refresh, before its Agents popup opens. **On-demand load** means reading one historical card's referenced activity when that card's Agents popup first asks for conversation history.

## implementation details

- Make project open and refresh automatically load only active-card activity and project-agent activity. `cardsForAgentConversationLoading` has one caller, so change its selection directly; do not add a mode flag.
- Cache project-agent conversations in `AgentIntegration` and populate them through the existing project activity reference listing. `DataService.listAgentConversations` should return this cache for project contexts and await the same load when an automatic load is still in flight.
- Add one `AgentIntegration` operation that ensures conversations for a specific card are loaded. For active cards it returns the automatic-load cache. For archived or released cards it resolves only that card's `agents` references, validates `cardInternalId`, merges conversations and errors into existing state, refreshes the card snapshot, and dispatches its scoped conversation change event.
- Make the card branch of `DataService.listAgentConversations` call that operation. Opening the card file or selecting it in the tree does not load activity; mounting its Agents popup does, through the existing `ActionConversationPickerOwner` and `ActionConversationStore.load` path.
- Track completed and in-flight loads per project-agent/card identity so repeated or concurrent popup requests share work. Reset this state when the project changes. Ignore a result if its project load token is stale.
- Preserve existing concurrency limits, error telemetry, warning dialogs, conversation-ID validation, acknowledgement updates, and released-card read-only action guards. Do not load unrelated background-card activity while satisfying one request.
- Update agent integration and data-service tests. Cover project-open selection, project-agent loading, historical on-demand loading, concurrent requests, stale project results, and load failures.

## acceptance criteria

- Opening or refreshing a project automatically reads project-agent activity and activity referenced by active cards, but reads no activity referenced only by archived or released cards.
- Opening a released or archived card file alone does not read its activity. Opening that card's Agents popup loads all and only its referenced conversations, then displays its conversation history.
- Reopening the same historical card's Agents popup uses cached conversations. Concurrent requests for the same card do not duplicate storage reads.
- Loading one historical card updates its conversation count, history, usage, acknowledgement state, and load errors without changing another card.
- Cards without `agents` references return empty history without an activity read. Invalid references or conversations belonging to another card keep existing warning and telemetry behavior.
- Active-card and project-agent history remain available without first opening a historical card. Switching projects prevents late results from the previous project from entering current state.
