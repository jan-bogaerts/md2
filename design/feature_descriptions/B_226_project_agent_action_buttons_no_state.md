---
author: 
id: B_226
internalId: cd3e256b-4d1e-433f-97b9-a662110f1596
title: project agent action buttons no state
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__cd3e256b-4d1e-433f-97b9-a662110f1596.json
policy:
---

the project agent has an action that is waiting for a response. the FAB button correctly shows the state, but then when you open the action popup, no action button shows the same state, so it is confusing. after some digging, one of the actions indeed had a conversation that was 'waitingForInput'.

sometimes this does seem to work however, so I think perhaps it has something to do with the agent running or not?  The situation is currently happening when it is not running

## Current state

`AgentChatFab` loads project-origin conversations and derives its aggregate state from `AgentIntegration.getProjectAgentConversationsSnapshot()`. It also reads active runs from `ActionRunRegistry`, so it can show waiting state from either persisted conversation data or a live run.

Action selector buttons read live state from `ActionRunRegistry`, but their persisted-state hook is card-scoped and requires `cardInternalId`. Here, live means active in current app process. Project context has no card ID, so each button resolves to `idle`. `ActionPopup` has same gap when choosing its initial action: `persistedActionStates` returns no project states. Result seems intermittent because live runs supply state while process still owns run; after run is no longer live, only persisted project conversation remains and popup loses per-action state.

## Implementation details

* Replace selector button's card-only persisted-state lookup with context-scoped lookup. For project context, subscribe to `PROJECT_ACKNOWLEDGEMENT_EVENT`, read project conversation snapshot, filter by action ID, then derive state with existing `cardAgentState` priority. Keep current card/file lookup unchanged. `ActionSelectorButton` is only production caller of card-only hook.
* Extend `ActionPopup.persistedActionStates` to derive per-action states from project conversation snapshot when context kind is `project`. Keep card resolution and initial-selection priority unchanged: explicit action, live queued/running work, persisted running work, waiting/unseen attention, column default, first action.
* Keep live status precedence over persisted status. Project conversation load or acknowledgement event must update affected selector button without closing popup.
* Do not change conversation persistence, backend run lifecycle, FAB aggregate state, or non-project contexts.
* Add focused tests for project persisted state in selector and popup. Cover no-live-run waiting state, initial selection, event-driven update, action scoping, and unchanged live-over-persisted precedence. Run affected app tests and app lint.

## Acceptance criteria

* Given loaded project conversation with `status: waitingForInput` and no live run, opening project action popup selects matching action and shows its warning border, help icon, and accessible `Agent is waiting for input` label.
* Only action whose `actionId` matches conversation shows persisted state; unrelated action buttons remain idle.
* Persisted project `running` and unseen-result states use same button signals already used for card actions. Unseen result means conversation has `viewed: false` and is not waiting or running.
* If project conversations finish loading or acknowledgement state changes while popup is open, matching button updates without reopening popup.
* Live queued, running, or waiting status continues to override conflicting persisted state.
* Project FAB behavior, card/file/diagram/folder/merge-conflict action state, conversation selection, and run execution remain unchanged.
