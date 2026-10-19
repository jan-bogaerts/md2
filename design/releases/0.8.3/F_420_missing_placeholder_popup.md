---
author: 
id: F_420
internalId: bf523460-d2c4-4156-b278-3f971b7c2f30
title: missing placeholder popup
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.3/card__bf523460-d2c4-4156-b278-3f971b7c2f30.json
policy:
changedFiles:
  - app/src/components/card_view/card_body_editor.real.test.tsx
  - app/src/components/card_view/card_body_editor.tsx
  - app/src/components/shell/project/new_card_markdown_editor.real.test.tsx
  - app/src/components/shell/project/new_card_markdown_editor.tsx
---
when creating new cards and when editing cards with the card-popup, the {{ does not trigger the insert-placeholder popup.

this used to work and has been lost. we need to restore the feature

## Current state

`MarkdownEditor` installs the `{{` typeahead plugin, but defaults its `placeholders` prop to an empty list. `NewCardMarkdownEditor` and `CardBodyEditor` do not supply a list. The trigger therefore finds no options and opens no popup in either card body editor. Action prompt editors supply `ACTION_PROMPT_PLACEHOLDERS` and still show the popup.

## Implementation details

* Supply the existing placeholder catalog to `MarkdownEditor` from both `NewCardMarkdownEditor` and `CardBodyEditor`. Keep the shared editor's empty default for callers that do not offer placeholders.
* Reuse the existing trigger, filtering, selection, and popup rendering. Keep each editor's existing `overlayContainer` so the popup appears above its dialog or card popup.
* Add regression coverage for typing `{{` and selecting a placeholder in each card body editor. Preserve the new-card editor's hidden toolbar and the card popup's current toolbar.

## Acceptance criteria

* In a new card's body and an existing card's popup body, typing `{{` in the rich-text editor opens the insert-placeholder popup with available placeholders.
* Typing a placeholder name filters options. Selecting one replaces the unfinished `{{` query with the complete `{{name}}` text in the card body.
* Popup remains visible and selectable above the containing dialog or card popup. Existing action prompt placeholder behavior still works.
