---
author: 
id: B_367
internalId: 212c070c-0ec8-4bed-be93-77c2d0b8fd99
title: non streaming conversations cant use a plan or task list
status: ready
owner: 
affects:
agents:
  - design/activity/card__212c070c-0ec8-4bed-be93-77c2d0b8fd99.json
policy:
after: d2e9440e-e79e-4abe-9092-d786540e29d3
changedFiles:
  - app/src/services/config/config_entries.ts
  - desktop/src/actions/action/action_agent_executor.test.mjs
  - desktop/src/actions/agent/agent_execution.js
  - desktop/src/actions/agent/agent_execution.test.mjs
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
---

When starting an action that is not configured a streaming, we still appear to ask the agent to prepare a plan.

codex replied with:

> I’ll use update_plan for multi-step work and explicit task lists, and skip it for simple requests and answer-only questions.

No plan request was done, it was just to shorten a text.

so most likely, we also pass the switch to use plans when we are in non-streaming mode. this is wrong.

## Current state

* `resolveAgentExecution` applies `desktop.agentTaskTrackingEnabled` to both streaming and non-streaming runs.
* Non-streaming Codex commands explicitly enable `tools.update_plan` when task tracking is enabled. `AgentRunnerService` also prepends the Codex task-tracking instruction to the one-shot user prompt. This injected text can be treated as part of a simple transformation request, which explains the observed response.
* Non-streaming Claude runs likewise receive the environment setting that enables task tools.
* The one-shot provider parser and conversation UI can decode and display task lists, but non-streaming actions must not request or use them.

## Implementation details

* In `resolveAgentExecution`, derive the effective task-tracking value as `streaming && (config.agentTaskTrackingEnabled ?? false)`. Use that value for command construction and return it in the resolved result so downstream Codex and Claude paths receive the same decision.
* Remove `codexOneShotPrompt` and stop modifying non-streaming Codex prompts. Keep the shared Codex task-tracking instruction for streaming app-server sessions.
* Keep the existing task-list decoders, persistence, and conversation UI unchanged. Historical task lists and streaming task tracking remain supported.
* Update the task-tracking configuration description to state that it applies to streaming conversations.
* Add focused tests proving that non-streaming Codex disables `update_plan`, non-streaming Claude does not enable task tools, and one-shot prompts remain unchanged. Retain coverage for enabled streaming runs.

## Acceptance criteria

* Starting a non-streaming action makes MD² disable Codex `update_plan` and refrain from enabling Claude task tools, regardless of the desktop task-tracking setting.
* A non-streaming Codex action receives the original action prompt without task-tracking instructions.
* Simple non-streaming transformations do not produce responses that repeat or paraphrase hidden task-tracking instructions.
* Streaming Codex and Claude conversations still receive task-tracking instructions and tools when task tracking is enabled.
* Disabling task tracking continues to disable task tools in both execution modes.
* Existing task-list decoding, persistence, and rendering behavior remains unchanged.
