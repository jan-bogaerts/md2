---
author: 
id: B_102
internalId: 3616573b-1a04-4f9f-aa5c-88ae92cb1188
title: switch between agents looses conversation
status: ready
owner: 
affects:
agents:
policy:
---
&#x20;I tried to switch a conversation from claude to codex, but codex appeared to start from scratch. we need to check if the switching agents works correctly: as the new agent wont have a conversationId to pick up from, we need to sent the current conversation as a whole to the new agent.&#x20;

Even worse. now, when you switch to another agent and send a message, the entire conversation gets lost and it just says 'failed'

## Current state

Agent settings can change between completed turns and while a streaming conversation waits for input. The popup continues from the selected or live conversation path. For a waiting conversation, it first finishes the current provider process, then starts another action run with the changed agent settings.

`ActionAgentExecutor` already loads the persisted conversation before a continuation. When the selected agent has no provider session, it builds normalized context from the complete MD² transcript and starts a new provider session. `AgentRunnerService` reuses the conversation id and path, copies existing entries, appends the new turn, and persists the terminal conversation.

Unit tests cover executor-level provider handoff and popup-level restart separately. No integrated test proves that agent selection, restart, transcript handoff, persistence, and popup rendering preserve one conversation. Reported behavior shows this combined path can still end with only a generic failed result visible.

## Implementation details

- Keep selected conversation as canonical record during an agent switch. Continuation must retain its path, id, existing entries, and provider-session records; selected agent is a run override, not a new conversation.
- When switching a waiting streaming conversation, finish and persist current provider turn before starting selected provider. Do not start second process until first process has closed successfully.
- If selected provider has no synchronized session, start new provider session without passing previous provider's id. Send full normalized transcript as prior context and append current user message exactly once.
- If switching back to provider with existing session, resume that session and send only entries after its synchronization cursor.
- On successful switched turn, persist new provider id, cursor, assistant response, and unchanged earlier transcript atomically to same activity conversation.
- On failure before new turn starts, leave persisted transcript unchanged and keep user's draft. On failure after turn starts, retain all earlier entries and persist visible failure event. Popup must keep conversation selected and show concrete provider or startup error, not replace chat with only `failed`.
- Preserve same-provider continuation, conversation ownership checks, missing-session retry rules, and activity-file schema.
- Add renderer tests for agent selection through restart and failure recovery. Add desktop tests for Claude-to-Codex, Codex-to-Claude, switch-back, same-reference persistence, no duplicate user message, and failures before and after turn start.

## Acceptance criteria

- Switching from Claude to Codex, or Codex to Claude, keeps all earlier user and assistant messages visible in same conversation.
- First turn with newly selected provider receives complete normalized transcript plus current user message, without previous provider's session id.
- Switching back resumes that provider's saved session and supplies only conversation entries created since its cursor.
- Switching while current provider waits for input closes and persists current process before selected provider starts.
- Successful switch keeps same conversation id and path, stores selected provider's session record, and survives popup close and application reload.
- Startup or provider failure never removes or hides earlier transcript. Error identifies failure cause, conversation remains selected, and unsent draft remains available when no turn started.
- Each submitted user message and assistant response appears once.
- Existing same-provider continuation, missing-session fallback, conversation ownership validation, lint, and tests remain passing.
