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
The config entry `desktop.agent` (`app/src/services/config_service.ts`) offers options `codex` and `system` ("System default"). The value is used verbatim as the shell command by `ActionRunner` → `runAgent` → `runProcessWithInput` in `desktop/local_git_service.js`, so choosing "System default" spawns a process literally named `system`, which fails. There is no mapping from the option to any real default agent.

## Fix
- Decide what "system default" means. Recommended: drop the fake option and make `desktop.agent` a free-text command (validated non-empty) with `codex` as default — the design says "the string that gets sent to the agent is configurable".
- If a named default is kept, resolve it in one place (desktop config module) to a concrete command before spawning, and fail with a clear message when unresolvable.
- Add validation feedback in the action popup when an agent run fails to spawn (currently the exit path reports, spawn `error` events reject — verify the message reaches the log/status).

## acceptance criteria
- No selectable config value causes a spawn of a nonexistent literal command.
- The agent command is configurable as text and used consistently by all agent execution paths.
- A bad agent command produces a clear failed-run message in the action popup.
- Tests cover command resolution and the spawn-failure message.

## see also
- `design\feature_descriptions\F_010d_agent_actions.md`
- `design\feature_descriptions\F_031_config_persistence.md`
