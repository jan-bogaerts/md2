---
id: F-051
title: common phrases
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 841a737e-1fb8-4bea-bf8f-08080472d93d
---

## Goal

The user can launch prompts on the responses of actions real quick by clicking on a button to send a pre-defined phrase to the agent.

## Current state

Actions have no predefined phrases. Agent follow-ups require typing in the extra-prompt field and then clicking `Continue`. The action editor shows structured action-definition fields above a separate Markdown prompt editor.

## Implementation details

- Add `phrases` to the action model as a list of `{ title: string, text: string }` objects. `text` is Markdown; when `title` is empty, display a truncated first line of `text`.
- Update action validation, loading, serialization, built-ins and TypeScript definitions to preserve `phrases`. Existing actions without the field use an empty list.
- Replace the agent action editor's two stacked sections with a bottom tab bar containing `Definition`, `Prompt`, one tab per phrase, and `+`. The add control creates and selects a phrase.
- A phrase tab shows the shared Markdown editor with a title field directly below its toolbar. Add a trash-can toolbar action with tooltip `Delete this predefined phrase`.
- Show the selected action's phrases in the agent popup after an agent response. A single click copies the phrase Markdown into the prompt field; a double click also starts the follow-up turn through the existing continuation flow.
- Cover parsing, validation, serialization, phrase add/edit/delete, fallback labels, click and double-click behavior with tests.

## Acceptance criteria

- Action JSON persists ordered phrase objects with `title` and Markdown `text`; actions without `phrases` still load with no phrases.
- The agent action editor always shows `Definition`, `Prompt`, phrase tabs and `+`; phrase changes auto-save through the existing draft flow.
- Users can add, edit and delete phrases. Each phrase has a title field below the Markdown toolbar, and deletion uses a trash-can action with the required tooltip.
- Empty titles display as a truncated first line of the phrase text.
- After an agent response, a phrase click fills the popup prompt without running it; a double click fills it and starts the follow-up.
- App and desktop lint and tests pass.
