---
author: 
id: F_430
internalId: c4a908bd-423a-4c5f-8a18-1a5e24d91740
title: agent task tracking setting
status: ready
owner: 
affects:
agents:
  - design/activity/card__c4a908bd-423a-4c5f-8a18-1a5e24d91740.json
policy:
after: 94766c8f-2f01-42ee-b389-7e03c1753946
---

Part of [F_380](F_380_add_possibility_to_support_task_tracking_tool.md). Add one global setting that turns agent task tracking on for all agents.

## Current state

Claude Code v2.1.233+ disables `TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList` and `TodoWrite` by default on newer models (Opus 4.8+, Sonnet 5, Fable 5, …). Verified on Claude Code 2.1.280 with `claude-opus-5-5`: the `init` event lists no task tools; with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` it lists the four `Task*` tools. Without them the model probes with `ToolSearch` (`"TaskCreate"`, `"task create todo"`) and reports that no task-tracking tool exists.

Codex has `update_plan` built in and on by default. It is switched off with the config key `tools.update_plan.enabled` (found in the codex 0.156.1 binary; no environment variable exists for it). Like other Codex config, it can be set per run as a command-line argument: `-c tools.update_plan.enabled=false`.

Codex command arguments are built in `shared/agent_profiles.mjs`, which already adds `-c` overrides (`model_reasoning_effort`, `service_tier`, `features.fast_mode`). Call sites:

* `buildAgentExecutionCommand` (one-shot): called from `resolveAgentExecution`. `buildResumeAgentCommand` reuses the execution command, so resumed runs inherit its arguments.
* `buildAgentStreamingCommand` (streaming): called from `resolveAgentExecution` and directly from `action_agent_executor.js`. It does not receive `codexSearchEnabled` today.

`desktop.codexSearchEnabled` is the existing precedent for a global boolean agent setting: defined in `app/src/services/config/config_entries.ts` (section `desktop`), validated and defaulted in `desktop/src/shell/config.js`, and applied in `resolveAgentExecution` (`desktop/src/actions/agent/agent_execution.js`).

`createAgentEnvironment` (`desktop/src/actions/agent/agent_environment.js`) already adds one Claude-only variable. Call sites:

* `AgentRunnerService.start`: conversation turns, receives the new behavior.
* `AgentModelCatalogService`: model catalog listing, keeps old behavior.
* `AgentRunnerService` usage refresh: reporting command, keeps old behavior.

## Implementation details

* Add config entry `desktop.agentTaskTrackingEnabled` (boolean, section `desktop`, label `Agent task tracking`, default `false`) next to `desktop.codexSearchEnabled`, so it shows on the Desktop config section with the other agent settings. Description: lets Claude and Codex keep a task list shown in the conversation; costs extra context.
* `desktop/src/shell/config.js`: validate the field as boolean (fail fast like `codexSearchEnabled`) and add a default.
* Carry the flag from desktop config onto the agent run request in the same place `codexSearchEnabled` is read.
* `createAgentEnvironment`: when the flag is on and the agent is `claude`, add `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` unless the inherited environment already sets it. Only the run-start call site passes the flag.
* Codex: when the setting is off, add the command-line argument `-c tools.update_plan.enabled=false` when the agent is started. Pass the flag to both `buildAgentExecutionCommand` and `buildAgentStreamingCommand` (both call sites of the streaming builder), so one-shot, streaming and resumed runs agree. When the setting is on, add nothing (Codex default).
* Verify during implementation that with the argument Codex no longer sends `turn/plan/updated` (streaming) or `todo_list` items (one-shot).

## Tests

* `agent_environment` test: variable added only for Claude with the flag on; an inherited value is left alone.
* `config.js` test: missing or non-boolean field fails.
* `agent_profiles` tests: Codex one-shot and streaming commands contain `-c tools.update_plan.enabled=false` only when the setting is off; Claude commands are unchanged.
