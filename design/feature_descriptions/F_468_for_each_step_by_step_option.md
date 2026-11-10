---
author: 
id: F_468
internalId: 56755966-50b9-466a-8a42-cd433b5f1f2d
title: for-each step by step option
status: ready
owner: 
affects:
agents:
  - design/activity/card__56755966-50b9-466a-8a42-cd433b5f1f2d.json
policy:
changedFiles:
  - app/src/components/actions/run/popup/action_for_each_menu.test.tsx
  - app/src/components/actions/run/popup/action_for_each_setup_dialog.test.tsx
  - app/src/components/actions/run/popup/action_for_each_setup_dialog.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_defaults.ts
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - app/src/components/actions/run/popup/action_popup_run_controls.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.test.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.tsx
  - app/src/data/action_run_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - desktop/src/actions/action/action_for_each.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/action/action_run_request.test.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
  - shared/action_for_each.mjs
---

we recently added the for-each function to actions. See [F_458_add_for_each_feature.md](design/releases/0.11.0/F_458_add_for_each_feature.md) . It automatically iterates over the records and moves to the next record when the agent is ready (stopped or is waiting for input).

This is working, but we now need to add an extra option configurable from the for-each config popup: a checkbox, when checked, the engine will not automatically go to the next record when the agent goes into waitingForInput mode. instead, the engine only advances when the user presses a new 'next' button.

This button should be next to (in front of) the existing `stop` and `send` buttons in the action-popup's input section.

## Current state

For-each configuration is stored on the conversation and contains the JSON data, data path, end mode, failure policy, start index, and records per batch. The setup dialog can edit these values while the loop is idle.

Electron processes records sequentially. After a record's agent turn completes without a pending question or approval, `ActionRun` automatically finishes that agent run. The record then settles and the loop starts the next record. The action popup can stop or finish work and send another prompt, but it has no control that advances only the current for-each record.

## implementation details

- Add required boolean `stepByStep` to `ActionForEachConfig`. New configurations default to `false`; shared validation supplies `false` when loading an existing configuration that predates this field. Persist and restore it with the conversation-owned for-each configuration.
- Add a `Step by step` checkbox to `ActionForEachSetupDialog`. Place explanatory text with it: `Pause after each record when the agent waits for input. Use Next to finish that record and start the next one.` Stage the value with the other setup fields and save it only when the user presses `Save`.
- Keep current automatic behavior when `stepByStep` is `false`.
- When `stepByStep` is `true`, do not auto-finish the active agent run after its turn enters `waitingForInput`. Keep the same for-each record active until the user sends more input, stops the loop, or presses `Next`.
- Add a dedicated renderer-to-Electron operation for advancing the active for-each record. Validate that the action run is live, uses step-by-step for-each, is in `waitingForInput`, and has no pending question or approval. Then finish only the active agent run so `executeAgentForEach` completes that record and continues its existing sequential loop. Do not treat `Next` as cancellation, failure, or completion of the whole action run.
- Add an outlined-icon `Next` control to `ActionPopupRunControls`, before the existing finish/stop/send controls. Show it only for a live step-by-step for-each run in `waitingForInput`. Disable it while a question or approval is pending, while interaction controls are not ready, while historical conversation is displayed, or while the backend is unavailable.
- `Send` continues the current record and does not advance the loop. `Stop` keeps cancelling the active turn and all remaining records. Existing finish behavior remains unchanged.
- Update the shared configuration validator and types, setup-dialog tests, action-run tests, bridge tests, and popup control tests. Cover default automatic behavior, the manual pause, `Next`, pending-interaction blocking, control order, `Send`, and `Stop`.

## acceptance criteria

- For-each setup shows a checkbox named `Step by step` with text explaining that the loop pauses when the agent waits for input and that `Next` finishes the current record and starts the next one.
- `Step by step` is unchecked for a new for-each configuration. Saving, closing, and reopening the popup preserves the selected value. Existing configurations without the field behave as unchecked.
- With `Step by step` unchecked, a record that completes without a pending question or approval advances automatically, preserving current behavior.
- With `Step by step` checked, `waitingForInput` does not advance the loop. The current record and conversation remain active until the user sends input, stops, or presses `Next`.
- `Next` appears before the existing finish/stop/send controls only while a live step-by-step for-each run is in `waitingForInput`.
- `Next` is disabled while an agent question or approval is pending, while interaction controls are not ready, while historical conversation is displayed, or while the backend is unavailable.
- Pressing enabled `Next` finishes only the current record. The next record starts through the configured `add prompt`, `compact`, or `new conversation` flow, including records-per-batch behavior.
- Pressing `Send` continues the current record with the entered prompt and does not change the record index.
- Pressing `Stop` cancels the active work and starts no later record.
- Pressing `Next` for a stale, non-waiting, non-for-each, or non-step-by-step run is rejected without advancing or changing another run.
- Failure policy, progress counts, start index, cancellation, empty input data, and existing actions without step-by-step remain unchanged.
