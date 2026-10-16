---
author: 
id: F_432
internalId: a26843ed-31d2-45f1-93b7-80a3256094d2
title: claude task list decoder
status: design
owner: 
affects:
agents:
  - design/activity/card__a26843ed-31d2-45f1-93b7-80a3256094d2.json
policy:
after: 9b09a37c-cd87-4996-a6cd-ef49b2f60090
---

Part of [F_380](F_380_add_possibility_to_support_task_tracking_tool.md). Turn Claude's task tool calls into the task list from [F_431](F_431_agent_task_list_model_and_run_update.md). Needs [F_430](F_430_agent_task_tracking_setting.md) for Claude to have the tools.

## Current state

* Claude task tools arrive as ordinary `tool_use` blocks. Streaming renders them through `claudeToolEvent` (`agent_claude_streaming_adapter.js`) as `tool.TaskCreate` / `tool.TaskUpdate` rows with raw JSON; one-shot records them through `claudeTranscriptEvents` (`agent_claude_events.js`).
* `agent_claude_events.js` holds decoders shared by the one-shot parser (`agent_provider_protocol.js`) and `ClaudeStreamingAdapter`; new decoders must live there. `ClaudeFileResultDecoder` already pairs a `tool_use` with its `tool_result` and reads `tool_use_result` when one result block is present.
* Sub-agent events carry `parent_tool_use_id`.

## Implementation details

* Add `ClaudeTaskListDecoder` (own file) used by both paths:
  * `TaskCreate`: remember `{ subject, activeForm }` by `tool_use.id`. On the matching `tool_result`, read the task id from `tool_use_result.task.id` and add the task as `pending`. Ignore results with `is_error`.
  * `TaskUpdate`: read the id from `taskId`, falling back to `id` / `task_id` (Claude Code repairs these names before execution, the stream shows the raw input). Apply `status` (`in_progress` → `inProgress`), `subject`, `activeForm`. `status: 'deleted'` removes the task. Unknown ids are logged and skipped.
  * Each change emits the full list as a `taskList` run event.
  * `TodoWrite` is not decoded (only appears with `CLAUDE_CODE_ENABLE_TASKS=0`, which md2 does not set).
* Sub agents: merge their task changes into the same list. Task ids are expected to be unique per Claude session; verify during implementation. If ids collide between parent and sub agent, key sub-agent tasks by `parent_tool_use_id` + task id.
* Hide: task tool calls and their results produce no transcript entries in either path. `TaskGet` and `TaskList` are hidden too; they read state and change nothing.
* Reset decoder state where `ClaudeFileResultDecoder.reset()` is called.

## Edge cases

* After `--resume`, Claude's own task state may differ from the stored list; the stored list shows until the next change replaces it.
* A `TaskUpdate` before its `TaskCreate` result arrives: skipped and logged.

## Tests

Fixture stream-json events, run through both the one-shot parser and `ClaudeStreamingAdapter`:

* create → update → complete → delete produces the expected lists.
* Fallback id keys, `is_error` results, sub-agent tasks merged.
* No transcript entries for task tools.
