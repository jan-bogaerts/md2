---
author: 
id: B_89
internalId: dfbc6cef-75cf-4a68-8e34-e72a7724769e
title: markdown editor in list view missing toolbar
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__dfbc6cef-75cf-4a68-8e34-e72a7724769e.json#conversation=agent-a28f904e-4e39-4eea-a990-4a406f5a08d6
  - design/activity/card__dfbc6cef-75cf-4a68-8e34-e72a7724769e.json#conversation=agent-8f3d7046-8339-4417-9b21-e83ce505b181
policy:
after: db0d6a75-3aa8-49ef-b855-a0cd4253e25d
branch: b_89_markdown_editor_in_list_view_missing_toolbar
worktree: 2
---

When a markdown file, located in a regular folder, is opened, there is no toolbar shown.

This includes for markdown files that are created with the app itself.

## Current state

List view opens regular Markdown files as card documents without an `internalId`. `ListEditorToolbarControls` returns no content when that ID is missing, hiding formatting and undo/redo controls together with card-only controls. Files created in the app use this same document shape.

## implementation details

- Always render shared Markdown formatting controls for an active list-view Markdown document.
- Use card `internalId` when present and file path otherwise as undo/redo history key.
- Keep Agents, commit history, and card properties controls limited to documents with a card `internalId`.
- Add regression coverage for regular Markdown files and preserve existing card-toolbar behavior.

## acceptance criteria

- Opening a regular Markdown file in list view shows working formatting and undo/redo controls.
- Markdown files created through the app show the same toolbar when opened.
- Regular Markdown files do not show card-only Agents, commit history, or properties controls.
- Card toolbars and Markdown editing, history, and save behavior remain unchanged.
