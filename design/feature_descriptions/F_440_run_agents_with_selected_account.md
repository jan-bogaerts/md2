---
author: 
id: F_440
internalId: ca17847c-ab46-4a35-9756-fe5a145ccaf2
title: run agents with the selected account
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ca17847c-ab46-4a35-9756-fe5a145ccaf2.json
policy:
branch: f_440_run_agents_with_the_selected_account
after: 733d678c-49a7-4409-9fa2-5fb384821513
worktree: 1
---

Use the account selected by F_439 for agent execution and persist which account actually ran. Conversation provider-session ownership is handled separately in F_441.

## Current state

* `ActionAgentExecutor` resolves the agent and execution settings, then builds an `AgentRunnerService` request.
* `AgentRunnerService` calls `createAgentEnvironment(process.env, agent, agentTaskTrackingEnabled)` for spawned agent processes.
* `createAgentEnvironment` filters inherited variables and applies Claude task-tracking behavior, but it cannot select a provider configuration directory.
* Live runs, completion results, activity details, and history identify the agent and model but not an account.

## Implementation details

* Resolve the effective account record once before starting a process. A missing account ID resolves to the selected agent's initial account. An explicit missing, mismatched, unreadable, or unavailable account fails before process start.
* Pass the resolved account through `ActionAgentExecutor` and `AgentRunnerService`; do not repeatedly look it up from mutable configuration during one run.
* Extend `createAgentEnvironment` to accept the resolved account while preserving current filtering and Claude task-tracking behavior:
  * for an initial account, leave `CODEX_HOME` and `CLAUDE_CONFIG_DIR` as inherited;
  * for a Codex directory account, set `CODEX_HOME` to its resolved directory;
  * for a Claude directory account, set `CLAUDE_CONFIG_DIR` to its resolved directory.
* Apply the account environment to normal and streaming agent processes and Codex cache diagnostics associated with the run.
* Store the resolved `accountId` on the live run. Reuse that captured account for failed-turn retry and other work belonging to the same run even if desktop defaults change meanwhile.
* Return and persist `accountId` in completion results, run history, and agent activity details. Resolve the current display name from desktop configuration when rendering history; persisted identity remains the stable ID.
* Scheduled, chained, and remote-controlled actions enter through the same account resolution and runner path.
* Do not change provider-session matching, model-catalog caching, usage poll contexts, metrics CSV, or reset schedules in this task.
* Add focused environment, executor, runner, diagnostic, activity, history, scheduled/chained action, and bridge tests. Run directly affected desktop/app tests and lint.

## Acceptance criteria

* A fresh Codex or Claude run uses the configuration directory of its resolved directory account.
* A run using the initial account behaves exactly like the current inherited-environment execution.
* Explicit invalid or unavailable accounts fail clearly and never fall back to another account.
* Live runs, retries, completion results, history, and activity details retain the account that actually started the run.
* Changing a default account while a run is active does not change that run's environment or recorded identity.
* Immediate, scheduled, chained, and remote-controlled runs use the same execution behavior.

