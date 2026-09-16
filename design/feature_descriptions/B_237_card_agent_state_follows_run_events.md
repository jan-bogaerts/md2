---
author: 
id: B_237
internalId: e92293d1-a775-46d9-ab48-57a8123b7c56
title: card agent state follows run events
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e92293d1-a775-46d9-ab48-57a8123b7c56.json
policy:
after: be94932a-4808-47eb-aa34-e52dd9504e7f
---
Keep the card action spinner in step with the live run. Split from [B\_235](B_235_end_of_action_not_logged.md); consumes the single backend status from [B\_236](B_236_backend_owns_agent_run_status.md).

## Current state

The card spinner reads a different copy of the status than the action popup does. `CardRunButton` (`app/src/components/actions/run/trigger/card_run_button.tsx:26-29`) uses the live registry run when one exists, and otherwise falls back to `cardAgentState(...)` (`app/src/services/agents/card_agent_state.ts:38`) over the conversations stored in `AgentIntegration`.

That stored copy is barely updated. `AgentIntegration.handleActionRunEvent` (`app/src/services/agents/agent_integration.ts:380-396`) reacts only to `agentStarted` and `agentClosed`. Every intermediate transition — `waitingForInput`, `failed`, `cancelled` — never reaches the card store, so a stored conversation stays `running` for the whole run and is corrected only by the final `agentClosed`. When that final event is missing or the persisted record is stale, the spinner spins forever, which is the reported symptom.

Reload cannot heal it either: `preferExistingConversations` (`agent_integration.ts:46`) unconditionally keeps the in-memory record over the one just loaded, so a corrected activity file never replaces a stale in-memory `running`.

## implementation details

* `AgentIntegration` consumes the backend `state` updates and applies the new status to the stored conversation. Update only that field; do not republish the card or a conversation snapshot, announce through the existing scoped acknowledgement events.
* `preferExistingConversations` keeps the existing record only while that conversation is live in the run registry. With no live run the loaded record wins, so a corrected activity file takes effect on reload.
* `cardAgentState` keeps its current priority order; it only needs the stored status to be truthful. Its `running`-plus-last-`waiting`-event heuristic becomes redundant once the status is maintained, so remove it rather than leaving two rules.
* Tests: waiting question during a run turns the card spinner into the waiting state without an `agentClosed`; a failed run clears the spinner; a project reload after a corrected activity file adopts the corrected status; a reload while the run is live keeps the live record.

## acceptance criteria

* Card spinner and action popup always show the same state for the same run.
* Card state reaches `waiting for input`, `failed`, and `cancelled` without waiting for `agentClosed`.
* Reload adopts the on-disk conversation whenever no live run holds that conversation.
* A single field change updates only the affected card action leaf; no card or conversation object is republished for it.