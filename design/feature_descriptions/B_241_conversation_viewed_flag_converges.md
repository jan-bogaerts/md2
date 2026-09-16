---
author: 
id: B_241
internalId: ce82acf0-7a8f-4201-ac60-7c43b28f4e82
title: conversation viewed flag converges from backend
status: ready
owner: 
affects:
agents:
  - design/activity/card__ce82acf0-7a8f-4201-ac60-7c43b28f4e82.json
policy:
changedFiles:
  - desktop/src/actions/activity/conversation_view_events.js
---
Let the backend announce conversation view state so every window agrees. Split from [B\_235](B_235_end_of_action_not_logged.md).

## Current state

The write path is already correct: `AgentAcknowledgementService.setViewed` (`app/src/services/agents/agent_acknowledgement_service.ts:91`) calls the bridge method `updateActionConversationViewed` and the backend performs the file write. The renderer never touches the activity file itself.

What is missing is the way back. After the call resolves, `setViewed:104-105` assigns `current.viewed` and `conversation.viewed` on its own objects, and the backend emits nothing. A second window keeps showing the conversation as unseen until it reloads the activity file. The renderer patches its copy rather than being told the new value, so the two windows can disagree for an unbounded time.

## implementation details

* Backend emits a scoped event after the view-state write succeeds, carrying the conversation reference and the new `viewed` value. Send the one field; do not republish the conversation or the card.
* Every renderer applies that value to its stored conversation and announces through the existing scoped card and card-action acknowledgement events.
* The originating renderer keeps its optimistic local set so the UI still responds immediately. The backend value that follows replaces it, including when it differs.
* A failed write reverts the optimistic value to what the backend last reported; the existing error dialog stays.
* Tests: a second window observes the change without reloading; the originating window updates before the round trip completes; a failed write reverts; a backend value that disagrees with the optimistic one wins.

## acceptance criteria

* Marking a conversation viewed or unseen in one window is reflected in every other window without a reload.
* The originating window updates immediately, before the backend confirms.
* A failed write leaves no window showing a view state the file does not have.
* The backend value always wins when it differs from an optimistic local one.