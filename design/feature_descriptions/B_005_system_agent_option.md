---
id: B-005
title: desktop.agent "System default" option spawns the literal command `system`
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
Still present after the F-033 agent-profile rework (2026-07-06 audit). The built-in profile list (`BUILTIN_AGENT_PROFILES` in `app/src/data/agent_profiles.ts` and its duplicate `desktop/agent_profiles.js`) contains `{ command: 'system', name: 'system' }`, and `buildAgentCommand`/`resolveAgentCommand` use the profile's `command` verbatim as the shell command. Selecting the `system` profile (app menu, action popup, action json or `desktop.agent` config) spawns a process literally named `system`, which fails — there is still no mapping to any real default agent.

## Fix
- remove the fake `system` built-in profile — user-defined profiles with free-form commands now cover the "configurable agent string" requirement, and `codex`/`claude` remain sensible defaults.
- Add validation feedback in the action popup when an agent run fails to spawn (verify spawn `error` events reach the run log/status shown in the popup).

## acceptance criteria
- No selectable config value causes a spawn of a nonexistent literal command.
- The agent command is configurable as text and used consistently by all agent execution paths.
- A bad agent command produces a clear failed-run message in the action popup.
- Tests cover command resolution and the spawn-failure message.

## see also
- `design\feature_descriptions\F_010d_agent_actions.md`
- `design\feature_descriptions\F_031_config_persistence.md`
