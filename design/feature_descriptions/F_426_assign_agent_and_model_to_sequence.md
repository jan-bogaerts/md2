---
author: 
id: F_426
internalId: 26179cc3-97a2-4a33-9e4f-a3b7116e217c
title: assign agent and model to sequence
status: ready
owner: 
affects:
agents:
  - design/activity/card__26179cc3-97a2-4a33-9e4f-a3b7116e217c.json
policy:
changedFiles:
  - app/src/components/actions/run/sequence/card_sequence_agent_selection.tsx
  - app/src/components/actions/run/sequence/card_sequence_dialog.test.tsx
  - app/src/components/actions/run/sequence/card_sequence_dialog.tsx
  - app/src/components/actions/run/sequence/card_sequence_draft_service.node.test.ts
  - app/src/components/actions/run/sequence/card_sequence_draft_service.ts
  - app/src/data/electron_action_bridge.ts
  - desktop/main.js
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.js
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.test.mjs
  - desktop/src/actions/schedule/sequence_schedule_contract.test.mjs
  - shared/action_schedules.d.mts
  - shared/action_schedules.mjs
after: f65510e2-6beb-4c9d-87be-077031583414
---

We need to be able to assign agent, model, reasoning level and such (same bunch as for actions) to a sequence

## Current state

`CardSequenceDialog` selects one action for an ordered list of cards, plus worktree, ready state, and trigger. `CardSequenceDraftService` sends those values through `SequenceScheduleRegistrationRequest`; it has no action-run agent settings. Its existing `agent` field selects the **account-reset trigger provider**, not the agent that runs the action.

`ActionAgentSelectors` offers agent, model, thinking level, permission mode, and speed for individual agent actions. Those choices resolve against the action definition and desktop agent profiles. The scheduler persists sequences in `.md2-schedules.json`. `ScheduledCardSequenceEngine` starts each card action with only `conversationId`, so execution uses action/desktop defaults. `ActionRun` applies run input only to the root action; chained actions use their own definitions.

## Implementation details

* Add one sequence-wide agent selection to the sequence draft and show the same supported choices as individual agent actions when the selected action has type `agent`. Initialize from that action's settings and desktop defaults; switching actions updates the selection. Keep account-reset trigger agent separate.
* Validate agent availability and supported model, thinking level, permission mode, and speed before Start/Schedule. Show the reason and disable submission when selection is invalid. Command actions need no agent selection.
* Include the resolved selection in the registration request, validate it in the desktop scheduler, and persist it on the sequence schedule. Extend shared schedule parsing/types without breaking schedules already stored without selection. Capture settings at registration so delayed sequences do not change when desktop defaults later change.
* Pass persisted selection as `runInput` for **each card's root action**. Sequence settings override that action's defaults; chained actions keep their own settings. Keep settings through sequence advancement and restart. Existing sequences without selection keep current action/desktop default behavior.
* Cover draft validation and request, dialog controls, schedule parsing/registration, and execution across multiple cards and restart. Check old schedules, command actions, unavailable agents, and account-reset triggers.

## Acceptance criteria

* User can choose agent, model, thinking level, permission mode, and supported speed once for an agent-action sequence; chosen values appear before Start/Schedule.
* Every card's root action runs with those values, including after a delayed trigger or desktop restart. Later desktop default changes do not alter registered sequence settings.
* Missing or unsupported selections block registration with a clear error. Command-action sequences still run without agent settings.
* Account-reset trigger provider remains independent of execution agent. Existing schedules without selection still load and run as before.
