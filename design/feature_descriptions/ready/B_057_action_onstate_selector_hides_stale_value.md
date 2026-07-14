---
id: B-057
title: action onState selector hides values absent from project states
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

An action can load with an `onState` value no longer present in project configuration. `ActionDefinitionFields` passes that value to a select containing only current states, producing an out-of-range/blank control while silently retaining the stored trigger.

## Fix

- Include a stored missing state in selector options, labelled as unavailable/missing.
- Show helper text explaining that the state no longer exists and the trigger cannot fire until corrected.
- Allow user to clear the trigger or select a current state.
- Do not silently replace it with the first state or `No state trigger`.
- Treat the stale value as an editor warning rather than a structural load failure. Preserve it until the user changes or clears it; it remains dormant because no current state can match it.

## Edge cases

- State is renamed while editor is open.
- Project has no configured states.
- External action reload introduces a stale state.
- Stored state differs only by case; state matching remains exact unless domain model says otherwise.

## acceptance criteria

- Stored `onState` is always visible in the control.
- Missing state is clearly marked and never silently cleared/replaced.
- User can repair or remove it through structured controls.
- No MUI out-of-range warning occurs.
- Tests cover stale state, no states, state config reload, clear, and replacement.

## see also

- `design\architecture\initial description\writings\action_editor.md`
- [[F-010e]]
