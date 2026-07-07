---
id: B-033
title: agentSlot schedule command is env-var-only, not configurable
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
F-022 specifies the `agentSlot` trigger resolution as "a configurable command whose output is a timestamp". The implementation reads the command exclusively from the `MD2_AGENT_SLOT_COMMAND` environment variable (`defaultAgentSlotCommandProvider` in `desktop/action_scheduler_service_core.js`); when it is unset, the schedule fails with "Missing MD2_AGENT_SLOT_COMMAND for agentSlot action schedule".

Every other desktop setting migrated to the `electron-store`-backed desktop config with env vars as first-run defaults (F-031), editable from `/config`. The agent-slot command is the one desktop knob left outside that system: it cannot be seen or changed from the UI, and it silently diverges from the config-page mental model ("every entry shown on /config demonstrably affects behavior" — here the inverse: behavior exists with no entry).

## Fix
- Add a `desktop.agentSlotCommand` entry to the config model (`config_service_core.ts` entries + `DesktopConfigValues`) and to `desktop/config.js` (`readDesktopConfig`/`writeDesktopConfig`), with `MD2_AGENT_SLOT_COMMAND` as the initial default like other desktop values.
- Change the scheduler's `agentSlotCommandProvider` default to read the stored desktop config (the scheduler already receives `agentConfigProvider`/store access in `desktop/main.js`).
- Keep the clear failure message when the command is empty, now pointing at the config entry instead of the env var.

## acceptance criteria
- `/config` (desktop mode) shows an agent-slot command entry with a description; saving persists it across restarts.
- An `agentSlot` schedule uses the configured command; changing the config changes the command used by the next resolution without restarting.
- With no command configured, registering/firing an `agentSlot` schedule fails with a user-visible error naming the config entry.
- `MD2_AGENT_SLOT_COMMAND` still seeds the value on first run.
- Tests cover config read/write of the new entry and the scheduler resolving the command from the store.

## see also
- `design\feature_descriptions\ready\F_022_scheduled_actions.md`
- `design\feature_descriptions\ready\F_031_config_persistence.md`
