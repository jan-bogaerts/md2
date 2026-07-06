---
id: F-033
title: agent and model selection (menu, per action, per run)
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Full agent selection per the architecture: "Set default agent from menu, or configurable on the action definition or when the action is started." Additionally allow selecting the **model** the agent should use (e.g. `codex --model …`, `claude --model …`), with the same three levels: global default, per action definition, per run.

## Current state
Far short of the spec. The only selection point is the global `desktop.agent` config entry (`app/src/services/config_service.ts`), a hard-coded select limited to `codex` and `system` — an arbitrary agent command line cannot be entered through the UI (only via the `MD2_AGENT` env var read in `desktop/config.js`). There is no menu item to set the default agent, no `agent` field on the action definition (`app/src/data/action_types.ts`), no agent picker on the action popup when starting a run, and no model concept anywhere. `ActionRunner` always resolves the agent from the single global value (`defaultAgentCommandProvider` in `app/src/services/action_runner.ts`).

## implementation details
- Model the agent as a named profile: `{ name, command, modelArgument?, models?: string[], defaultModel? }`. Ship built-in profiles (codex, claude, system default) and allow user-defined profiles with a free-form command template supporting a `{{model}}` placeholder.
- Configuration levels, most specific wins:
  1. run-time choice on the action popup (agent + model dropdowns next to `Run`),
  2. `agent` / `model` fields on the action definition json (extend loader validation in `app/src/services/action_definition_loader.ts`),
  3. global default, settable from the app menu (`app/src/components/shell/menu/app_menu.tsx`) and from the config page.
- Persist agent profiles and the default agent/model in the desktop config store (`desktop/config.js`); keep the React config service as the read/write surface so web mode still displays (but disables) desktop-only entries.
- `ActionRunner` resolves the effective agent profile + model per run and passes the final command line to the bridge; the run history entry records which agent/model executed.
- Replace the two-option `desktop.agent` select with the profile list; keep `MD2_AGENT` as an override for the default profile's command.
- The built-in `custom prompt` action and Remarkable convert action use the same resolution path.

## acceptance criteria
- The app menu offers "Default agent" (and model, when the profile defines models); the choice persists across restarts.
- An action json can set `agent` and `model`; runs of that action use them regardless of the global default.
- The action popup shows agent and model pickers pre-filled with the effective values; changing them applies to that run only.
- A user can define a new agent profile with a custom command line through the config UI and select it at all three levels.
- Run history shows the agent and model used for each entry.
- Invalid references (action names an unknown agent profile or model) fail at action load with a clear error.
- Tests cover the three-level resolution order, profile persistence, command construction with `{{model}}` and load-time validation.

## see also
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\config.md`
- `design\feature_descriptions\F_010d_agent_actions.md`
- `design\feature_descriptions\B_006_agent_command_sources.md`
