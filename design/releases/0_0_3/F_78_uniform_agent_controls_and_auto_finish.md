---
author:
id: F_78
internalId: 33679a6b-31e2-401a-9e3b-39b32ffe5f41
title: Uniform agent controls and automatic streaming finish
status: ready
owner:
affects:
agents:
policy:
---

## Problem

Streaming controls currently depend on the root action and expose separate Run, Continue, Send, Finish, and Cancel treatments. This breaks mixed streaming/non-streaming chains and makes provider lifecycle details visible in the UI.

Prompt input is disabled during one-shot turns. Streaming input can only be sent immediately; it cannot remain queued for the next turn. Streaming execution also requires a manual Finish operation even when a domain event can determine completion.

## Goal

Use one agent interaction UI for streaming and one-shot actions. Controls follow the currently active child action in a chain, not the root action.

## Action contract

Add optional `autoFinish` to streaming agent actions:

```json
{
  "streaming": true,
  "autoFinish": {
    "state": "ready"
  }
}
```

- Missing `autoFinish` means manual finish.
- Only a card-state trigger is supported initially.
- Reject `autoFinish` on command and non-streaming actions.
- Reject execution before process start when the action has `autoFinish` but the run has no card context.
- Reject unknown fields, empty state values, and invalid configured states.
- Do not add legacy or fallback shapes.

## Uniform controls

- Keep the prompt enabled during every agent turn.
- Use one icon-only Send control with an upward arrow. Accessible label and tooltip: `Send`.
- Use one icon-only Stop control for every running agent action. Accessible label and tooltip: `Stop`.
- Stop cancels the full action execution.
- Do not show Run, Continue, Send, Finish, or Cancel as button text.
- Show an icon-only Finish control, using a checkmark, only for an active streaming action without `autoFinish`. Accessible label and tooltip: `Finish`.
- Live output, selectors, conversation display, and status presentation remain provider-independent.

## Prompt queue

Prompt draft and queued input belong to shared action-execution state keyed by execution and active action. Closing and reopening the popup must preserve them.

- Starting an idle action sends the prompt as its first turn.
- Text entered during an active turn becomes the queued next message.
- Streaming:
  - clicking Send during an active turn sends the queued message immediately through provider steering;
  - otherwise, turn completion sends the queued message as the next turn in the same process.
- One-shot:
  - input remains queued while the process runs;
  - turn completion starts a one-shot follow-up process with the queued message before the action phase completes.
- Clear the visible prompt only after the queue accepts the message.
- A click racing with turn completion must send the message exactly once.
- Empty or whitespace-only input is never sent.
- Starting a queued follow-up delays `on`, `onAfter`, auto-commit, and history finalization.

## Structured questions

- A single-response question renders each answer as a button. Clicking a button submits immediately.
- Multi-response and free-text questions render their inputs with one Submit button.
- Secret answers must not be written to transcript, logs, activity files, or Git history.
- A pending structured question takes precedence over ordinary queued prompt submission.

## Finish lifecycle

Manual Finish and automatic finish are successful completion, not cancellation.

- While a turn runs, mark the session as finishing and close it after the turn completes.
- While waiting between turns, close it immediately.
- Do not send queued prompt text after finishing begins.
- Persist terminal conversation state before continuing the action chain.

For `autoFinish`, observe the active card. When its state becomes the configured value, request finish using the same lifecycle. State changes for another card or an inactive chained action do nothing.

## Mixed action chains

Electron publishes enough active-phase metadata for React to identify the current child action, its type, streaming mode, `autoFinish`, and interaction state.

- Controls bind to the active child action.
- A streaming child of a one-shot or command root receives streaming controls.
- A one-shot child of a streaming root receives one-shot behavior.
- Controls must not become interactive during worktree preparation or before an agent process is ready.
- Transitioning between chained actions clears action-specific queued input only after it has been sent or explicitly discarded by finish/cancel.

## Main implementation areas

- `shared/action_definitions.mjs` and `.d.mts`: field parsing, validation, defaults, and serialization.
- `desktop/src/actions/action_execution.js`: active child metadata, queue-aware phase completion, and finish trigger ownership.
- `desktop/src/actions/agent_runner_service.js`: exactly-once queue/steer boundary and successful finish lifecycle.
- Electron preload, local dispatch, and remote-control bridge: active metadata and interaction operations.
- `app/src/services/actions/action_execution_service.ts`: shared prompt draft, queue, and active child state.
- `app/src/components/actions/action_popup_content.tsx`: uniform icon controls.
- `app/src/components/actions/action_agent_question.tsx`: response-shape-specific question controls.
- `app/src/components/actions/action_definition_fields.tsx`: Auto finish switch and card-state selector.

## Tests

- Field default, serialization, invalid shapes, command/non-streaming rejection, and unknown state.
- Manual runs with missing card context fail before provider spawn.
- Same controls for streaming and one-shot roots.
- Mixed chains derive controls from each active child.
- One-shot queued follow-up and streaming queued next turn.
- Immediate steering versus turn-completion race sends exactly once.
- Prompt queue survives popup close/reopen.
- Manual Finish, automatic state Finish, and Stop remain distinct terminal paths.
- Finish delays chain, auto-commit, and history until terminal persistence.
- Single-response buttons, multi-response Submit, free text, and secret-answer redaction.
- Local Electron and remote-control behavior stay equivalent.

## Acceptance

- User sees one agent interaction model regardless of provider or execution mode.
- Mixed chains always show controls for the active child action.
- Prompt input remains available and queued input is never lost or duplicated.
- Streaming actions finish manually or through configured card-state change.
- Successful finish resumes normal action completion; Stop cancels it.
