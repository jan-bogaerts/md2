---
id: B-009
title: running-agents indicator misses action and onState runs
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Only some conversation paths register in the global running list. Manual, state-triggered, scheduled, command, agent, and continuation runs can therefore disagree across the shell indicator, card, popup, and conversation panel.

## Fix

- Drive the global indicator from the Electron action runner's start, phase, output, and terminal event stream.
- Include manual, `onState`, scheduled, command, agent, continuation, and cancellation events. Identify runs by execution id and actions by stable action id.
- The indicator shows the root action, currently executing linked action, context, phase, and status.
- For `onState`, attach a failed terminal event to the related card and clear its in-memory `currentAction`.
- Do not create a second UI-owned execution registry or runner.

## acceptance criteria

- Starting any action increments the global running count until Electron reports a terminal execution state.
- Chain phase changes update the listed current action and phase without changing the root execution id.
- Cancellation removes the run after its cancelled terminal event.
- A failed `onState` action produces a visible error tied to the card and clears its current action.
- Tests cover every execution entry point and completed, failed, cancelled, and `okButNotAfter` terminal events.

## see also

- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\ready\F_010e_state_triggers_and_watching.md`
- `design\feature_descriptions\ready\F_023_agent_streaming.md`
