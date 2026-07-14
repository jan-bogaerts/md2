---
id: B-029
title: renderer can supply executable action data
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Action orchestration currently lives in React. The renderer resolves action objects, traverses their chains, and passes execution data to Electron. Command execution already reloads a definition by action name, but agent requests can still contain prompt and command data, and action names are used as identifiers. Renaming an action can break links, schedules, and history.

The required boundary is simpler: actions only run in Electron, and Electron owns the complete action runner.

## Fix

- Move manual and state-triggered action orchestration from React to the Electron action runner used by every execution entry point.
- Change start requests to `{ actionId, context, runInput }`. Change cancellation and live-input requests to use the Electron execution id.
- Electron loads and validates the persisted definition by stable `id`, resolves `onBefore`, `on`, and `onAfter` ids, prepares `needsWorkTree`, resolves placeholders, and starts command or agent processes.
- Do not expose a bridge method that accepts a raw command, persisted prompt template, resolved definition, or chain supplied by the renderer.
- Use the same Electron runner for schedules so no second execution implementation can accept a different shape.
- Keep this feature limited to action ownership, ID lookup, and the action bridge shape.

## acceptance criteria

- A renderer can start an action only by persisted action id plus context and run-specific input.
- Unknown action ids and invalid definitions are rejected before any process starts.
- Renaming an action does not break execution, linked actions, or schedules.
- Manual, state-triggered, and scheduled runs use the same Electron action runner.
- No renderer-facing method accepts arbitrary shell text or a persisted agent prompt template.
- Tests cover id lookup, rejected executable input, chain resolution in Electron, and identical runner use from all entry points.

## see also

- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\ready\F_010c_command_execution_and_chaining.md`
- `design\feature_descriptions\ready\F_013_desktop_app.md`
