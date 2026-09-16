---
author: 
id: B_236
internalId: be94932a-4808-47eb-aa34-e52dd9504e7f
title: backend owns agent run status
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__be94932a-4808-47eb-aa34-e52dd9504e7f.json
policy:
---
Make electron backend the only place that computes agent run status. Split from [B\_235](B_235_end_of_action_not_logged.md).

## Current state

Backend already computes correct status. `transitionConversationStatus` (`desktop/src/actions/agent/agent_conversation.js:83`) is the single mutation point; `handleQuestion` and `handleApproval` (`agent_streaming_event_handlers.js:124,137`) set `waitingForInput`, `handleApprovalResolved:152` recomputes from `hasPendingInteraction(run)`, each persists a checkpoint and emits a `state` event.

That value is then discarded one layer up. `action_run.js` publishes run updates with a hardcoded status for four event kinds, ignoring the conversation: `agentEvent` (line 677), `usage` (line 690), `agentOutput` and `error` (line 705) all publish `'running'`. Both providers keep emitting those while a question or approval is pending, so the renderer is repeatedly told the run is running while it is in fact waiting for input.

The renderer defends itself by recomputing. `action_run_registry.ts:945-1005` forces `'waitingForInput'` whenever it holds a local question or approval and restores `event.status` when they clear; line 1040 rewrites `conversation.status` from that recomputed value for nearly every update kind. This is not a second opinion, it is a patch over a wrong published value.

Pending-interaction state therefore exists three times: `agent_run_state.js` (`waitingForQuestion`, `pendingApprovals`), `action_run.js` (`activeAgentQuestion`, `activeAgentApprovals`), `action_run_registry.ts` (`question`, `approvals`).

## implementation details

* Derive published status from run state at one backend helper. No publish site passes a status literal. `agentEvent`, `usage`, `agentOutput`, and `error` publish whatever the conversation currently holds.
* Remove `activeAgentQuestion` and `activeAgentApprovals` from `action_run.js`. Read pending interaction from agent run state through `hasPendingInteraction`; keep only the request ids `action_run.js` needs for dispatching queued prompts.
* Renderer stores `event.status` verbatim. Delete every status override in `action_run_registry.ts`, including the `conversation.status` rewrite. Question and approval payloads stay in the store as display data only; they must never influence status.
* Renderer may set status optimistically when it originated the change, for example after sending an answer or a message, purely for UI latency. Any status the backend reports afterwards replaces the optimistic value, including when it differs.
* Tests: tool event, token-usage tick, and streamed output during a pending question each keep `waitingForInput`; same during a pending approval; approval resolved returns to `running` only when no other interaction is pending; renderer store reflects backend status without local recomputation.

## acceptance criteria

* Exactly one place computes agent run status, and it is on the backend.
* Provider events arriving during a pending question or approval never move the published status to `running`.
* Renderer holds no code path that derives run status from its own question or approval list.
* Optimistic renderer status is always replaced by the next backend status for that run, including a differing one.
* Pending question and approval state is tracked once in the backend run state, not additionally in `action_run.js`.