---
id: F-003
title: special folders
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 1c06d955-309d-4d0f-80ff-6284afbbb395
after: 964fdcac-159c-49dc-af83-79f532e9651d
---

## Goal
Support the special folders in a project (history with a sub folder per release, architecture, prompts/actions), including moving md files to a history sub folder when a release is done and background loading of sub folder headers for search.

## Current state
Only the design notes exist. There is no project structure, folder handling, release/history logic or background header loading implemented yet.

## implementation details
- Recognize special folders inside the working folder: `history`, `architecture` and `prompts` (actions). Names should be configurable, defaulting to these.
- `history` holds one subfolder per release; active (root) cards are moved into the release subfolder when a release is completed.
- `architecture` holds generic description markdown files (like `data management.md`).
- `prompts` holds the actions that can run on markdown files; each action is defined by a markdown header (name, when allowed, ...) and/or a json definition that may reference a prompt file.
- Root markdown headers are loaded first for active cards; special/subfolder headers are loaded afterwards in the background and made available to search.
- "Complete release" operation moves the current root cards into a new `history/{release}` subfolder and commits the moves.
- Id numbering considers files across the folder and its subfolders (including history) so ids stay unique after archiving.

## acceptance criteria
- The `history`, `architecture` and `prompts` folders are recognized when a project is loaded, using configured or default names.
- Completing a release creates a `history/{release}` subfolder and moves the active root cards into it.
- Architecture files are loaded and available as generic description cards.
- Prompt/action files are loaded from the `prompts` folder using their header/json definition.
- Subfolder headers are loaded in the background after the root loads and are searchable.
- New card ids remain unique against files in subfolders, including archived history cards.

## see also
- `design\architecture\initial description\data management.md`
