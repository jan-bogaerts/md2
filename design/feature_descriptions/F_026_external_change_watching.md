---
id: F-026
title: external change watching
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Reflect external markdown file additions, removals and changes in the app while a local project is open (F-002 acceptance criterion), including importing newly discovered files that don't follow the naming convention as new feature cards.

## Current state
`local_git_service.js` `watchProject` already emits events for `.md` and `.json` changes under the project root, but `DataService.handleProjectWatchEvent` (`app/src/services/data_service.ts`) only reacts to action-definition JSON paths and silently drops every markdown event. Externally created/edited/deleted markdown files therefore never appear (or disappear) until the project is reopened, and the "import as new feature during usage" behavior from `data management.md` never triggers at runtime.

## implementation details
- Extend the watch event model with a change kind where available (`added`/`changed`/`removed`), falling back to "unknown" for `fs.watch` limitations.
- In `DataService`, debounce markdown watch events (similar to the existing action reload debounce) and reload the affected file(s) from storage: re-read a changed/added file, drop a removed file from `currentFiles`, then refresh the snapshot.
- Guard against self-echo: writes performed by the app itself (auto-save commits) will trigger watcher events; ignore events whose content matches the in-memory file, or suppress events for paths with pending/in-flight commits.
- Never clobber unsaved local edits: if a watched change arrives for a file with pending commit-batcher changes, keep the local version and surface a conflict notice instead of silently reloading.
- Files outside the naming convention found this way are imported as new feature cards with optional headers, using the existing parsing-service fallbacks.
- Scope: local-Electron mode only; GitHub mode has no watcher (unchanged).

## acceptance criteria
- Creating a markdown file in the working folder outside the app makes it appear as a card (status `new` when no header) without reopening the project.
- Editing a file externally updates the card/tab content when it has no unsaved in-app edits.
- Deleting a file externally removes its card and closes its tab.
- The app's own auto-save commits do not cause reload loops or flicker.
- An external change colliding with unsaved in-app edits is reported and does not overwrite the local edit.
- Tests cover add/change/remove handling, debounce, self-echo suppression and the conflict path.

## see also
- `design\feature_descriptions\F_002_data_management.md`
- `design\architecture\initial description\data management.md`
