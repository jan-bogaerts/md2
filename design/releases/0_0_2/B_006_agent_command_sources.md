---
id: B-006
title: two sources of truth for the agent command
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: a96f589c-feca-402b-8365-535f7b6b129a
---

## Problem

Action starts and conversation continuation currently resolve agent configuration through different paths. Moving action orchestration to Electron must also remove React-side executable-command resolution.

## Fix

- Make persisted desktop config the single source of truth.
- Resolve supported agent commands only in Electron for action starts and conversation continuation.
- React sends action id, context, and supported run-specific selection; it never sends an agent executable command.
- Keep environment values as first-run defaults only.

## acceptance criteria

- Changing supported agent configuration affects action runs and continuation immediately and after restart.
- Only one Electron-side path resolves executable agent commands.
- Renderer bridge requests contain no executable agent command.
- Tests cover both entry points and persisted config resolution.

## see also

- `design\feature_descriptions\ready\F_010c_command_execution_and_chaining.md`
- `design\feature_descriptions\ready\F_012_agents.md`
- `design\feature_descriptions\ready\F_031_config_persistence.md`
