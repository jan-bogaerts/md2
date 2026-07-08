---
id: J-013
title: shrink the ActionRunner dependency-injection surface
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`ActionRunner` (`app/src/services/action_runner.ts`) takes 15 optional constructor overrides (`agentRunner`, `commandRunner`, `bridgeProvider`, `projectProvider`, two history functions, five agent-run callbacks, …), nearly all existing only so tests can stub singletons. The low point is the `agentConfigProvider` fallback (constructor lines ~154-160): when a test passes the legacy `agentCommandProvider`, the constructor synthesizes a fake `DesktopConfigValues` with a made-up `'default'` profile — production-shaped data invented inside a compatibility shim. The wide surface obscures what the runner actually needs and makes every new capability grow the constructor.

## Fix
- Group the dependencies into three cohesive collaborator interfaces and inject those instead of 15 functions:
  - `ActionExecutionGateway` — bridge acquisition, `runAgent`, `runCommand`;
  - `ActionRunRecorder` — history load/append, run start/finish/event callbacks, conversation linking;
  - `ActionEnvironment` — project, actions folder, agent config.
- Provide one default implementation of each wired to the real singletons; tests replace whole collaborators (or use simple fakes) rather than individual lambdas.
- Delete the `agentCommandProvider` legacy path and its synthetic-profile shim; update the tests that used it to pass a real `DesktopConfigValues` fixture.
- `action_execution.ts`'s `ActionExecutionDependencies` collapses to the same three interfaces.

## acceptance criteria
- `ActionRunner`'s constructor takes at most a small dependencies object of collaborator interfaces; the synthetic-profile shim is gone (grep: no `'default'` profile fabrication in the constructor).
- No behavior change: run/before/after/on semantics, history, scheduling and popup flows all pass existing tests (updated only in how they construct the runner).

## see also
- `design\feature_descriptions\ready\J_008_split_action_runner_helpers.md`
- `design\feature_descriptions\ready\F_010c_command_execution_and_chaining.md`
