---
author: 
id: F_264
internalId: 66c61696-aa0f-473b-bd5a-e241c64a933f
title: check input on command agents
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__66c61696-aa0f-473b-bd5a-e241c64a933f.json
policy:
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/actions/agent/action_prompt_owner.tsx
  - app/src/components/actions/editor/action_definition_fields.test.tsx
  - app/src/components/actions/editor/action_definition_fields.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - app/src/components/actions/run/popup/action_popup_run_disabled.ts
  - app/src/components/editor/action_markdown_data_source.node.test.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/merge_conflict_dialog.test.tsx
  - app/src/data/action_context.node.test.ts
  - app/src/data/action_run_types.ts
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_service_helpers.ts
  - app/src/services/actions/action_text.node.test.ts
  - app/src/services/actions/electron_action_runner.node.test.ts
  - app/src/services/open_files_service.node.test.ts
  - app/src/services/search/search_project.node.test.ts
  - desktop/src/actions/action/action_command_executor.js
  - desktop/src/actions/action/action_command_executor.test.mjs
  - desktop/src/actions/action/action_definitions.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/action/action_run_request.js
  - desktop/src/actions/action/action_run_request.test.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/verify_command_window.js
  - shared/action_definitions.d.mts
  - shared/action_definitions.mjs
after: 67aa408b-6038-40b7-a82d-76678ca7b201
---
We need to check something: some command agents also might need input from the command line, we also need to support this. do we?

## Current state

The command popup uses the shared Markdown editor, but it previously started empty and treated its value as `extraPrompt` for `{{card-prompt}}`. That does not let the user inspect or edit the command being executed. Captured command execution also cannot support interactive PowerShell input because its console is not visible.

## Implementation details

* Prefill an idle command draft with the persisted command. Keep the Markdown editor and placeholder support, using monospace typography for commands.
* Submit edited command text as `runInput.command`. It overrides only the root command for that run; linked actions use their persisted commands. Keep `extraPrompt` for agent callers only.
* Preserve edited text when start fails. After Electron accepts the run, reset the next draft to the persisted command.
* Add a command-only `showCommandWindow` definition switch. When disabled, keep captured stdout/stderr execution unchanged.
* When enabled, launch the resolved command in a separate Windows command window, wait for it to close, and do not stream or capture its output. Cancellation terminates the command process tree.
* Apply windowed execution to manual, scheduled, state-triggered, and linked command actions without additional restrictions.

## Acceptance criteria

* Opening a command action shows its persisted command in one editable Markdown surface with placeholder support, monospace text, and one Run control.
* Clicking Run or pressing `Ctrl+Enter` executes the edited root command. Linked commands remain unchanged.
* Closing and reopening before submission preserves edits. A rejected start keeps edits; an accepted start resets the next draft to the persisted command.
* Enabling `showCommandWindow` opens a Windows console in the resolved repository or worktree and keeps the action running until the window closes.
* Windowed commands accept console input and do not publish stdout/stderr to the application. Captured commands retain existing output behavior.
* Stop closes the windowed command process tree. Schedules, state triggers, and linked actions may use the windowed mode.
* Agent prompt preparation and `extraPrompt` behavior remain unchanged.
