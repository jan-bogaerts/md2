---
author: 
id: B_93
internalId: 50ec96d2-8e7c-471a-a33b-9cbd4210b5cb
title: the popups are hidden behind the editor
status: ready
owner: 
affects:
agents:
  - design/activity/card__50ec96d2-8e7c-471a-a33b-9cbd4210b5cb.json#conversation=agent-7380cc17-bb0d-4318-8354-4fdec982959d
  - design/activity/card__50ec96d2-8e7c-471a-a33b-9cbd4210b5cb.json#conversation=agent-b54c2dbf-989e-47e5-8d7e-bd529a0fc5fa
policy:
after: ed76ce11-bea8-4942-aba9-2180b019f5f2
---

The file-search popup opened with `@` and the placeholder popup opened with `{{` are hidden behind the popup containing the Markdown editor. This affects the action popup and the card create/edit popups.

## Current state

`MarkdownEditor` has two custom caret typeahead popups: `MarkdownFileSearchTypeaheadPlugin` and `MarkdownPlaceholderTypeaheadPlugin`. Both render a menu through Lexical's absolute-positioned portal anchor. Neither anchor nor menu establishes a z-index above MUI popup surfaces, so both menus can be painted behind the action popup, new-card dialog and card-edit popover.

No other custom caret popup exists. Formatting-toolbar menus and dialogs are provided by MUI or MDXEditor and do not use this portal path.

## Implementation details

- Give both typeahead menus a positioned, theme-based overlay layer above MUI modal surfaces.
- Keep Lexical's portal target and caret positioning unchanged; no parent-popup or shared editor behavior needs changing.
- Test both menu surfaces above the theme's modal layer without asserting a fixed numeric z-index.

## Acceptance criteria

- File-search and placeholder results appear above the action popup, new-card dialog and card-edit popover.
- Results remain positioned at their `@` or `{{` query and stay inside the viewport.
- Mouse and keyboard selection still insert the selected file link or placeholder and return focus to the editor.
- Existing filtering, formatting-toolbar popups and Markdown editing remain unchanged.
