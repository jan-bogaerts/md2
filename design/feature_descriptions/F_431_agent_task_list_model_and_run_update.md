---
author: 
id: F_431
internalId: 9b09a37c-cd87-4996-a6cd-ef49b2f60090
title: agent task list model and run update
status: ready
owner: 
affects:
agents:
  - design/activity/card__9b09a37c-cd87-4996-a6cd-ef49b2f60090.json
policy:
after: c4a908bd-423a-4c5f-8a18-1a5e24d91740
changedFiles:
  - app/src/data/action_run_types.ts
  - app/src/data/data_types.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - shared/agent_conversations.mjs
---

Part of [F_380](F_380_add_possibility_to_support_task_tracking_tool.md). Provider-neutral task list on the conversation, persisted and sent to the renderer. Provider decoders ([F_432](F_432_claude_task_list_decoder.md), [F_433](F_433_codex_plan_decoder.md)) and the panel ([F_434](F_434_agent_task_list_component.md)) build on this.

## Current state

* Provider events become conversation entries in `agent_runner_service.js` (`handleProviderEvent`, `recordProviderEvent`) and reach the renderer as `agentEvent` updates with an `entryIndex` (`desktop/src/actions/action/action_run.js`).
* Conversation-level fields use their own update kind, e.g. `agentUsage` (`action_run.js`, `app/src/data/action_run_types.ts`, `app/src/services/actions/action_run_registry.ts`).
* `parseAgentConversationValue` (`shared/agent_conversations.mjs`) rebuilds the conversation from known fields only, so an unknown field is lost on reload.

## Implementation details

* Shape, stored as `conversation.taskList`:

  ```
  { tasks: [{ id, subject, status: 'pending' | 'inProgress' | 'completed', activeForm? }], updatedAt }
  ```

  Every change replaces the whole list (Codex sends full snapshots; Claude lists are small).
* Desktop runner: a run event `{ type: 'taskList', taskList }` from either decoder sets `run.conversation.taskList`, is included in the persisted checkpoint, and is emitted to the action run.
* `action_run.js`: publish it as update `{ kind: 'agentTaskList', taskList }`, next to `agentUsage`. No new IPC channel.
* `shared/agent_conversations.mjs`: validate and keep `taskList` in `parseAgentConversationValue`. An invalid list fails the parse like other invalid fields. Conversations without the field have no `taskList`.
* Renderer types: add `taskList?` to `AgentConversation` (`app/src/data/data_types.ts`) and the update kind to `action_run_types.ts`.
* `action_run_registry.ts`: apply `agentTaskList` to `conversation.taskList` with its own `conversationChange` kind, so transcript subscribers do not treat it as an entry change.

## Tests

* `parseAgentConversationValue`: valid list kept, invalid list rejected, absent list stays absent.
* Runner/action run: a `taskList` run event updates the conversation and publishes `agentTaskList`.
* Registry: `agentTaskList` replaces `conversation.taskList` and leaves entries untouched.
