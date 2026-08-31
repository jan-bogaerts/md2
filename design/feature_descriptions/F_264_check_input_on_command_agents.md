---
author: 
id: F_264
internalId: 66c61696-aa0f-473b-bd5a-e241c64a933f
title: check input on command agents
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__66c61696-aa0f-473b-bd5a-e241c64a933f.json
policy:
---

We need to check something: some command agents also might need input from the command line, we also need to support this. do we?

## Current state

An idle command-action popup shows status, history, scheduling, and Run controls, but no input editor. `ActionAgentInteraction` contains the existing prompt editor and hides it unless the root action or active chain phase is an agent.

Command input means text entered for one popup run, not process stdin. Transport already exists: `runPopupAction` reads the shared action prompt draft and sends it as `runInput.extraPrompt`; Electron passes that value only to the root action; `executeCommandAction` substitutes it for `{{card-prompt}}` in the persisted command. Without that placeholder, entered text does not alter the command. Linked `onBefore`, `on`, and `onAfter` actions receive empty input.

## Implementation details

- Generalize prompt-editor ownership so root agent and command actions can render the same service-owned draft and editor surface. Command drafts start ready and empty; they must not call agent prompt preparation.
- Render the prompt editor in an idle command popup. Embed existing schedule and Run controls in its footer, avoiding the current separate command footer and any duplicate controls.
- Keep command input keyed by action id, context, and run id through `actionPromptDraftService`. Popup close/reopen keeps typed text under existing draft-lifetime rules.
- Keep `runPopupAction` as submission path. Clicking Run or pressing `Ctrl+Enter` flushes editor text, sends it as `extraPrompt`, and starts the command once.
- Clear input only after Electron accepts the run and returns its run id. A failure before acceptance keeps input for retry and reports through `dialogService`.
- Keep existing Electron request validation, root-only input propagation, `{{card-prompt}}` substitution, command execution, scheduling, chaining, and cancellation behavior unchanged.
- Add focused popup tests for command editor rendering, typing, `Ctrl+Enter`, Run submission, successful clearing, failed-start retention, popup reopen, and absence of duplicate controls. Keep existing Electron substitution and root-only propagation tests.

## Acceptance criteria

- Opening a command action shows an editable input field and one Run control.
- Text entered in command popup replaces `{{card-prompt}}` in root command when Run is clicked or `Ctrl+Enter` is pressed.
- Empty input replaces `{{card-prompt}}` with an empty string. A command without `{{card-prompt}}` runs unchanged.
- Linked command phases do not receive root popup input.
- Input clears after Electron accepts run, including when command later fails. Input remains when start fails before acceptance.
- Closing and reopening popup before submission preserves typed command input.
- Command actions do not prepare an agent prompt, show agent selectors or attachments, or write popup input to process stdin.
- Existing command scheduling, history, status, cancellation, and agent-child interaction remain unchanged.
