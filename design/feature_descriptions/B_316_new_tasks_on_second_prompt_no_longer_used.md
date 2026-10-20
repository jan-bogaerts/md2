---
author: 
id: B_316
internalId: 16c530e0-7832-414c-bb82-b8c7f77ebf93
title: new tasks on second prompt no longer used
status: ready
owner: 
affects:
agents:
  - design/activity/card__16c530e0-7832-414c-bb82-b8c7f77ebf93.json
policy:
after: 733d678c-49a7-4409-9fa2-5fb384821513
changedFiles:
  - desktop/src/actions/agent/agent_claude_streaming_adapter.js
  - desktop/src/actions/agent/agent_provider_protocol.js
  - desktop/src/actions/agent/agent_run_state.js
  - desktop/src/actions/agent/agent_streaming_adapter.js
  - desktop/src/actions/agent/agent_streaming_adapter.test.mjs
  - desktop/src/actions/agent/claude_task_list_decoder.js
  - desktop/src/actions/agent/claude_task_list_decoder.test.mjs
---
Follow-up on [F\_434\_agent\_task\_list\_component.md](design/releases/0.9.0/F_434_agent_task_list_component.md) and [F\_432\_claude\_task\_list\_decoder.md](design/releases/0.9.0/F_432_claude_task_list_decoder.md). The task list works across prompts in a live run. Investigation found two gaps in the Claude task list decoder.

## Current state

* `ClaudeTaskListDecoder` (`desktop/src/actions/agent/claude_task_list_decoder.js`) keeps its tasks for the whole lifetime of the adapter. `reset()` at turn end only clears per-turn tool correlation. A task is only removed by a `TaskUpdate` with status `deleted`.
* Claude Code resets a task list once every task is completed, but keeps a high-water mark, so the next `TaskCreate` continues the numbering (6, 7, …).
* The decoder is created empty in the `ClaudeStreamingAdapter` constructor (`agent_claude_streaming_adapter.js`) and in `AgentProviderProtocolParser` (`agent_provider_protocol.js`). Both are created per process in `attachRunProtocol` (`agent_run_state.js`), which has the persisted `run.conversation.taskList` available.

## Problems

1. **Completed list is never replaced.** When Claude starts a new list after finishing the previous one, the new tasks are appended below the old completed tasks instead of replacing them.
2. **Task state is lost when the process restarts.** After an app restart or when a closed conversation is resumed, the new decoder is empty. `TaskUpdate` calls for earlier tasks are dropped with an `Unknown Claude task id` warning, and the first new `TaskCreate` replaces the whole list with only the new task.

## Implementation details

* Problem 1: in `applyCreateResult`, when every known task is completed, clear `tasks` before adding the created task. Keep `taskIds`, since Claude ids keep increasing and stay unique. The emitted list then holds only the new tasks.
* Problem 2: give `ClaudeTaskListDecoder` an optional initial task list in its constructor. For each task, store it in `tasks` and register it in `taskIds` under its owner: the prefix before `:` for namespaced sub-agent ids, `root` otherwise, with the raw id after the prefix.
* Pass `run.conversation.taskList` from `attachRunProtocol` through `createAgentStreamingAdapter` to `ClaudeStreamingAdapter`, and through `createAgentProviderProtocolParser` to `AgentProviderProtocolParser`.

## Tests

* Decoder: a `TaskCreate` result after all tasks are completed emits a list with only the new task.
* Decoder: a `TaskCreate` result while a task is still pending or in progress appends to the list.
* Decoder: seeded with a persisted list, a `TaskUpdate` for a seeded root task and for a seeded sub-agent task updates that task.
* Streaming adapter: a conversation with a persisted `taskList` seeds the decoder.
