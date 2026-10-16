---
author: 
id: F_433
internalId: bdfd6fc4-a938-4be2-86c7-2d8f92c55d96
title: codex plan decoder
status: design
owner: 
affects:
agents:
  - design/activity/card__bdfd6fc4-a938-4be2-86c7-2d8f92c55d96.json
policy:
after: a26843ed-31d2-45f1-93b7-80a3256094d2
---

Part of [F_380](F_380_add_possibility_to_support_task_tracking_tool.md). Turn Codex plan updates into the task list from [F_431](F_431_agent_task_list_model_and_run_update.md).

## Current state

* Streaming (`app-server`): Codex sends `turn/plan/updated` with `{ threadId, turnId, explanation?, plan: [{ step, status: 'pending' | 'inProgress' | 'completed' }] }` (verified against the codex 0.156 app-server schema). `handleNotification` in `agent_streaming_adapter.js` has no branch for it, so it is dropped.
* One-shot (`exec --json`): the plan arrives as a `todo_list` item. It is not in `SUPPORTED_CODEX_ITEM_TYPES` (`agent_codex_event.js`), so `AgentProviderProtocolParser` records a "Codex protocol diagnostic" row on `item.completed`. `item.updated` events are not handled. The item shape is assumed to be `{ id, type: 'todo_list', items: [{ text, completed }] }`; verify against codex 0.156 before implementing.
* The existing Codex `plan` item and `item/plan/delta` belong to plan-mode proposals and stay unchanged.

## Implementation details

* Streaming: handle `turn/plan/updated` for the root thread and emit a `taskList` run event. Task id = step index, subject = `step`, status as sent. Child-thread plans are merged into the same list with ids prefixed by thread id. `explanation` is not shown.
* One-shot: on `item.started`, `item.updated` and `item.completed` of a `todo_list` item, emit a `taskList` run event (status `completed` or `pending`; exec has no in-progress state). No diagnostic row and no transcript entry for it.
* Each update replaces the list; a new turn's plan replaces the previous one.
* When the setting from [F_430](F_430_agent_task_tracking_setting.md) is off, Codex is started with `-c tools.update_plan.enabled=false` and sends no plan updates, so this decoder needs no setting check of its own.

## Tests

* Streaming adapter: `turn/plan/updated` produces the expected list; child-thread plan merged.
* Protocol parser: `todo_list` across started/updated/completed produces lists and no diagnostic or transcript entry.
