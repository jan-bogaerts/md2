---
author: 
id: F_398
internalId: 7489aafd-8dd1-4e15-b8fe-a92d5bb5cfc0
title: new actions should default to streaming agents
status: ready
owner: 
affects:
agents:
  - design/activity/card__7489aafd-8dd1-4e15-b8fe-a92d5bb5cfc0.json
policy:
after: 2775052a-2e84-4466-a320-155c8ec05bac
branch: f_398_new_actions_should_default_to_streaming_agents
worktree: 1
---

when a new action is created, for a default, always default to a 'streaming' agent

## Current state

A *streaming agent* is an agent action whose definition has `streaming: true`: its agent session stays open after a turn, so the user can send more turns until the run is finished. The field is optional in `RawActionDefinition`; a missing field means not streaming. The action editor shows it as the `Streaming` switch in `action_definition_fields.tsx`.

New action definitions are created in two places, and neither sets `streaming`:

* `ActionService.createDefinition` in `app/src/services/actions/action_service.ts` builds the `New action` template. The app menu (`app_menu.tsx`) and mobile create menu (`mobile_create_menu.tsx`) call it, then open the editor.
* `createActionDefinition` in `app/src/services/actions/action_definition_writer.ts` builds a definition from a prompt. `defaultConvertPromptToAction` in `action_popup_defaults.ts` writes it to the actions folder. Two flows call it: `convertPromptToAction` in `action_popup_operations.ts` (popup "convert prompt" and "save and run") and `ActionConversationCommandService.saveAsNewAction` (conversation message "Save as new action"). Both copy agent, model, and permission mode from the current settings or source action, but not `streaming`.

`toRawActionDefinition` in `action_service_helpers.ts` already writes `streaming: true` when set and omits it otherwise, so saving needs no change.

## Implementation details

* Add `streaming: true` to the template returned by `ActionService.createDefinition`.
* Add `streaming: true` to the definition returned by `createActionDefinition`. Both convert flows get it through this one function; do not add a parameter, because no caller needs a non-streaming result.
* Keep the field order consistent with `toRawActionDefinition`, which places `streaming` before `phrases`.
* Do not change existing action files, built-in actions, project template actions, the loader, or the editor. The user can still turn `Streaming` off in the editor before or after saving; `handleStreamingChange` then removes the field and `autoFinish`.
* Out of scope: switching an existing action from `command` to `agent` in the editor (`handleTypeChange`) is an edit, not a creation, and keeps its current behavior (streaming stays off).
* Tests: update `action_definition_writer.node.test.ts` expectations to include `streaming: true`; extend the `createDefinition` test in `action_service.node.test.ts` to expect `streaming: true`. Check `action_conversation_command_service.node.test.ts` and any popup convert tests that assert the written definition.

## Acceptance criteria

1. Clicking `New action` in the app menu or mobile create menu opens the editor for an agent action whose `Streaming` switch is on. Saving it writes `"streaming": true` to the action JSON file.
2. Converting a popup prompt to an action, including "save and run", writes an action file with `"streaming": true`, plus the existing agent, model, and permission-mode values.
3. Saving a conversation message as a new action writes an action file with `"streaming": true`, even when the source action is not streaming.
4. Turning `Streaming` off in the editor and saving removes the field from the file; the action then runs as non-streaming.
5. Existing action files, built-in actions, and project template actions keep their current `streaming` value.