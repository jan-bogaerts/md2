---
id: B-049
title: action thinking level is persisted but never executed
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

The action editor can persist `thinkingLevel`, but the run popup, renderer-to-Electron request types, agent command resolution, execution history, and agent runner ignore it. Users can save a value that has no effect.

Current related code:

- `app/src/components/actions/action_agent_form.tsx`
- `app/src/data/electron_action_bridge.ts`
- `app/src/services/action_agent_run.ts`
- `desktop/src/shell/local_bridge_dispatch.js`
- `desktop/src/actions/agent_profiles.mjs`

## Fix

- Add thinking-level selection to agent run controls. Preselect the definition value; a run-specific change must not modify the saved definition.
- Add optional `thinkingLevel` to typed run input and Electron validation.
- Resolve the effective value in Electron from run input, persisted action definition, then application default where supported.
- Accept only `none`, `low`, `medium`, `high`, and `max`. `none` omits the thinking-level override from the invocation.
- Let the provider/agent adapter translate a thinking level into the correct execution argument. Do not guess a generic CLI flag.
- Reject values outside the fixed list and agents without a thinking-level adapter before starting a process.
- Record the effective thinking level in live execution state and persisted history.
- Define linked-action behavior explicitly: run-specific selection applies to the requested root action; linked actions use their own definition/default unless architecture is deliberately changed.

## Edge cases

- Agent changes to one without a thinking-level adapter.
- Existing definition contains a value outside the fixed list.
- Command actions must reject/ignore no agent selection fields by construction, not through a fallback.
- Scheduled and `onState` runs have no popup override and therefore use definition/default values.

## acceptance criteria

- Changing `thinkingLevel` changes the effective agent invocation.
- Definition value is preselected in the run popup and remains unchanged after a one-off override.
- Invalid values and agents without a thinking-level adapter fail before process start with a user-visible error.
- History records the effective thinking level.
- Manual, state-triggered, linked, and scheduled agent runs apply the same resolution rules.
- Tests cover definition default, runtime override, unsupported values, linked actions, schedules, and history.

## see also

- [[B-048]]
- [[F-010d]]
- `design\architecture\initial description\writings\running_actions.md`
