---
author: 
id: B_199
internalId: 72668dda-9401-49ca-adf2-cd433393214d
title: empty command action gives error
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__72668dda-9401-49ca-adf2-cd433393214d.json
policy:
after: 7dee6bc2-2c20-4336-99c8-2775f985089e
changedFiles:
  - app/src/components/actions/run/popup/action_popup_run_disabled.ts
  - app/src/components/actions/run/popup/action_run_disabled_message.tsx
  - shared/action_definitions.mjs
---
create new action, switch to command, user gets error 'missing action field command in xxxx'

this is not good, should not show an error just after creation

it even prevents the action from being saved. this is not good. action needs to be savable, even if still missing data.

## Current state

New actions start as valid agent actions. In `ActionDefinitionFields`, changing `type` to `command` removes agent-only fields and stages `command: ''`. The same select interaction reaches a blur or click commit boundary, so `ActionDraftStore.commitDraft` immediately validates that staged value.

`shared/action_definitions.mjs` uses `requireExecutableText` for both agent prompts and command text. It treats empty or whitespace-only command text as `Missing action field command in <path>`. `ActionDraftStore` displays that field error and queues persistence only for valid drafts, so switching type immediately shows an error and leaves the new command action unsaved.

Renderer saving and Electron execution currently share this strict definition validator. Persistence therefore cannot represent an incomplete command action, although execution must still reject one. Here, **incomplete command action** means a command action whose `command` field is a string but is empty after trimming.

`loadTolerantActionDefinitionGraph` supplies `echo Missing action command` only when the field is absent. It does not replace an explicit empty string. An empty command must not gain this executable fallback.

## Implementation details

1. In `shared/action_definitions.mjs`, separate structural command-field validation from execution readiness. Definition loading and saving must accept a string `command`, including an empty or whitespace-only string. A missing or non-string `command` remains invalid. Agent prompt validation and all other required-field rules remain unchanged.
2. Keep `ActionDefinitionFields.handleTypeChange` staging `command: ''`. Do not insert placeholder command text, suppress commit events, delay validation, or add component-owned save state.
3. Keep `ActionDraftStore` valid-only persistence. Once an empty command is structurally valid, the existing commit and autosave path must serialize it, publish the saved action through `ActionService`, and keep it open for editing.
4. Add execution-readiness validation at the shared Electron action-run boundary before placeholder resolution or process creation. Reject an empty or whitespace-only command with a clear missing-command error. This must cover root, linked, scheduled, and card-state-triggered command actions because all use the same action runner.
5. Manual run controls must not start an incomplete command action and must explain that command text is required. Do not hide the saved action from the editor or action lists.
6. Do not use `echo Missing action command`, another fallback command, or shell behavior as execution validation. No process may be spawned for an incomplete command action.
7. Add focused tests for type switching, empty-command persistence and reload, field-type rejection, manual run disabling, and Electron rejection before spawn. Update shared renderer/Electron validation-parity cases where empty command text intentionally becomes persistable.

## Acceptance criteria

* Switching a new action from Agent to Command shows an empty Command field without an error.
* The action is saved with `type: "command"` and `command: ""`, remains visible, and can be reopened and edited.
* Whitespace-only command text is also savable as incomplete data and is preserved exactly.
* Missing or non-string `command` fields remain definition errors; other required fields and agent prompts keep current validation.
* Manual, linked, scheduled, and card-state-triggered execution of an incomplete command stops before placeholder resolution and process spawn, with a clear command-required message.
* Entering non-whitespace command text uses existing autosave and execution behavior.
* No fallback command is inserted or executed.
* Focused action-editor, action-service, shared validation, and Electron action-runner tests pass; app and desktop lint pass.
