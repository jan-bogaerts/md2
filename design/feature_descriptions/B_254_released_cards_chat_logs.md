---
author: 
id: B_254
internalId: 6a0c59e3-d151-440b-bf00-fb0f1b16c37e
title: released cards chat logs
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__6a0c59e3-d151-440b-bf00-fb0f1b16c37e.json
policy:
---

At the moment, the chat logs of released cards (or archived) are no longer visible. this is a problem.

Although, there is an 'agents' button on the toolbar of the markdown editor on the card-editor in the list-view and it shows an action popup, it only shows the 'custom prompt' action.

This is not correct. it should show all the action buttons that were executed on the card, so all the actions in the activity log.

## Current state

Released and archived cards remain loaded as background cards with their `internalId` and `agents` activity-file reference. Release moves each card's activity file into the release folder and rewrites that reference; archive keeps the reference. `AgentIntegration` loads conversations for active cards at project startup and loads a background card's conversations when requested.

The list editor's Agents button opens `ActionPopup` with `fileContext`. Its selector uses `displayActionsForContext`, which filters currently loaded action definitions against the card's current context. It does not derive entries from the card's activity. An action that ran before release or archive can therefore disappear from the selector when its definition no longer matches or no longer exists, even though its run or conversation remains in the activity file. Released-card runs are already blocked; their stored history can be read.

## Implementation details

* For released and archived cards in the list editor, read the card's referenced activity file when Agents opens. Use `Card.header.internalId` to bind activity to the card. Use the activity path only to load it, and `AgentConversation.id` to select a conversation.
* Build one selectable entry per distinct executed action ID from activity records and conversations. Include command runs as well as agent conversations. When a current definition is missing, use the stored record label, or the action ID if no label was stored. Keep that entry available for reading stored history. Keep the built-in `custom prompt` entry.
* Selecting a historical entry shows that action's stored runs and conversations for this card, including entries whose definition has since changed or been deleted. Do not treat the card's current status or the current action applicability filter as evidence that a historical run did not occur.
* Preserve existing execution rules: released cards remain read-only; archived cards retain their existing run behavior. Report activity-load failures through `dialogService` rather than silently showing an incomplete action list.
* Add focused tests for released and archived cards, multiple historical actions, command runs, removed or no-longer-matching definitions, and failed activity loading. Run affected tests and app lint.

## Acceptance criteria

* Opening Agents for a released or archived card shows a button for every distinct action recorded in that card's activity, plus `custom prompt`.
* Selecting each historical action opens only that card's corresponding stored runs or conversations. Moving a card does not mix its history with another card's history.
* Historical entries remain readable when their action definition was removed or its applicability changed after the run.
* Released cards cannot start or continue actions. Archived cards keep their current execution behavior; active-card action selection remains unchanged.
* A missing or unreadable referenced activity file produces a visible error, not a misleading empty history.
