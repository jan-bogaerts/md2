---
id: F_057
title: preview and edit the prepared action prompt
status: ready
owner: JB
affects:
  - app/src/components/actions/action_agent_form.tsx
  - app/src/components/actions/action_popup_defaults.ts
  - app/src/components/actions/use_action_popup_controller.ts
  - app/src/data/action_run_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/remote_control_storage_service.ts
  - desktop/src/actions/action_agent_executor.js
  - desktop/src/actions/action_execution.js
  - desktop/src/actions/action_run_request.js
  - desktop/src/actions/action_runner_service.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Show the complete prompt for a selected agent action before execution, let the user edit that prompt directly, and execute the exact edited prompt. Electron remains the single source of truth for preparing prompts from action definitions and context.

## Current state

The action popup starts with an empty `extraPrompt` field. On `Run`, React sends the selected action id, context, run-time agent settings, and `extraPrompt` to Electron. Electron reloads the canonical action, resolves context placeholders, substitutes `{{card-prompt}}` or appends the extra text, optionally adds the tracked-file instruction, and sends the resulting prompt to the agent.

The user therefore cannot see or edit the complete prompt before it is sent. The bridge also rejects a `prompt` run-input field, so the popup cannot currently submit a prepared prompt as the execution input.

## Behavior

- When an agent action popup opens or the user selects another agent action, React asks Electron to prepare the prompt for that action id and context.
- Electron reloads the canonical action definition by id, resolves the same execution project or assigned worktree used by the action runner, resolves all prompt placeholders, and applies every prompt addition that would otherwise be applied immediately before starting the root agent action.
- Electron returns the resulting prompt as plain text. React places it in the popup's prompt input.
- The input is labeled `Prompt`, not `Extra prompt`. The returned text is editable and is the complete root-action prompt, not a suffix to the stored action prompt.
- `Run` sends the current input value as `runInput.prompt`, together with the existing agent, model, thinking-level, and continuation fields where applicable.
- For an interactive root agent action with `runInput.prompt`, Electron sends that value to the agent unchanged. It must not resolve the action prompt again, append it, substitute `{{card-prompt}}`, or add the tracked-file instruction a second time.
- The prompt recorded in the conversation and action-run history is the exact submitted prompt.
- The built-in custom-prompt action remains available. Because its definition is only `{{card-prompt}}`, its prepared prompt is empty and the existing required-prompt behavior remains.
- Selecting a predefined phrase replaces the editable prompt with the phrase. It no longer treats the phrase as an addition to the action definition.
- Converting the current prompt to an action uses the complete edited prompt shown in the field.

## Backend contract

- Add an Electron action-bridge operation such as `prepareActionPrompt({ actionId, context }) -> { prompt }`. The request contains an action id and context, never a renderer-owned action definition or persisted prompt.
- Expose the operation through the local preload bridge and remote-control bridge so local and remotely controlled popups behave identically.
- Keep prompt preparation in one Electron-side function shared by preview and normal agent execution. Preview must not introduce a second prompt-building implementation.
- Add `prompt` to the validated run input as an optional string. Its presence, including an empty string, is distinct from its absence.
- An interactive root agent run uses `runInput.prompt` when present. Linked `onBefore`, `on`, and `onAfter` agent actions continue to prepare their own prompts from their canonical definitions.
- Starts without a prompt override, including schedules, state-triggered actions, and existing non-popup callers, continue to prepare the prompt in Electron at execution time.
- Command actions retain their existing `extraPrompt` and `{{card-prompt}}` behavior. Removing that command-input contract is outside this feature.

## Popup state and errors

- Clear the previous action's prompt as soon as the selected action id or context changes, then show a loading state and disable `Run` until preparation completes.
- A late response for an earlier action or context must not replace the prompt for the current selection.
- Once the prepared prompt is displayed, user edits must not be overwritten by an unrelated refresh or late request.
- If preparation fails, show the error through `dialogService`, leave `Run` disabled, and do not fall back to the renderer's copy of the action prompt.
- While a run is active, keep the existing disabled-input behavior. After a completed initial run, retain the existing conversation flow for entering the next turn rather than restoring the action definition over the user's input.

## Compatibility and side effects

- Agent/model/thinking-level selection is unchanged; these settings remain run-specific and do not cause React to build or modify the prompt.
- Scheduling from the popup remains definition-based and does not capture edits in the prompt field.
- Action chains, cancellation, worktree selection, history identity, and execution-event semantics are unchanged.
- Preparing a prompt is read-only: it must not start an execution, acquire a long-lived execution lock, write history, create a conversation, or mutate project files.

## Acceptance criteria

- Opening a configured agent action shows the fully resolved Electron-prepared prompt, including context paths and any execution-time instruction that would be sent to the agent.
- Editing that prompt and pressing `Run` sends the exact edited text once; the stored action prompt is neither prepended nor appended.
- Switching actions or contexts requests a new prompt and never displays a stale response from the previous selection.
- `Run` is disabled while prompt preparation is pending or failed, and preparation errors are shown through `dialogService`.
- The custom-prompt action opens with an empty required `Prompt` field and runs the text entered by the user without additional prompt composition.
- Linked agent actions still build their own prompts in Electron, while the selected root action uses the submitted prompt override.
- Command actions and scheduled or state-triggered agent actions keep their current prompt-input behavior.
- Local Electron and remote-control popup flows use the same preparation contract.
- Tests cover exact prompt preview/execution parity, placeholder and worktree resolution, tracked-file instruction handling, empty-string presence, action/context selection races, preservation of user edits, preparation errors, custom prompt, phrases, linked actions, and local/remote bridge exposure.
- App and desktop lint, typecheck, and tests pass.

## See also

- `design/architecture/initial description/action_popup.md`
- `design/architecture/initial description/actions.md`
- `design/feature_descriptions/ready/F_010d_agent_actions.md`
- `design/feature_descriptions/ready/F_033_agent_and_model_selection.md`
- `design/feature_descriptions/ready/F_047_running_actions_and_agents.md`
