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
Only `AgentConversationService.continueConversation` registers in `runningAgents`; agent/cmd actions executed through `ActionRunner` never appear in the shell indicator. Worse, `onState`-triggered runs are fired from `DataService.moveCard` with `void actionRunner.run(...)` — they are completely invisible: no indicator, no popup, and errors are swallowed.

## Fix
- Register every `ActionRunner.run` invocation as a running agent/action for its duration (label = action label + context file), via `agentConversationService` or a small shared run-registry service.
- For `onState` triggers: don't `void` the promise — record the result, surface failures (workspace alert or the card's agent led), and write to the action run history like popup-initiated runs already do.
- The indicator popup lists these runs with their phase/status; supersede with the live registry from F-023 when that lands.

## acceptance criteria
- Running any action (popup, onState, continue) increments the shell running count for the duration of the run.
- A failed onState-triggered action produces a visible error tied to the card.
- Tests cover registry add/remove around runs and onState failure surfacing.

## see also
- `design\feature_descriptions\F_010e_state_triggers_and_watching.md`
- `design\feature_descriptions\F_023_agent_streaming.md`
