---
id: F-036
title: option to search in actions
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Add the optional "search in actions" capability from the search design: when enabled, the search control also matches loaded action definitions (label, description, name, text) and shows them as a separate result group.

## Current state
Search only covers project cards: `searchProject` (`app/src/services/search/search_project.ts`) matches active/background card headers and bodies. `SearchOptions` (`app/src/services/search/search_types.ts`) has no action flag and `actionService.getActions()` is never consulted by search. The architecture note (`design\architecture\initial description\search.md`) lists this as "perhaps also option to search in actions".

## implementation details
- Extend `SearchOptions` with `includeActions: boolean` (default off) and add a toggle to the search options popover in `SearchControl`, next to the existing background-body toggle.
- Add a pure `searchActions(actions, query, options)` in the search module matching `label`, `description`, `name` and `text` with the same text/regexp matcher used for cards, reusing `buildContext` for snippets.
- Extend `SearchResults` with an `actions: ActionSearchMatch[]` group rendered below the background groups in `SearchResults`, titled "Actions".
- Clicking an action result opens the action popup for that action with an empty context (or the built-in file-less context), mirroring how card results navigate.
- Keep the search module free of service imports: `MainWindow`/`SearchControl` passes the current actions in, same pattern as the snapshot.

## acceptance criteria
- With the toggle off, results are unchanged from today.
- With the toggle on, a query matching an action's label/description/name/text shows the action under an "Actions" group; text and regexp modes both work.
- Clicking an action result opens its action popup.
- Tests cover matching per field, regexp mode, and the off-by-default behavior.

## see also
- `design\architecture\initial description\search.md`
- `design\feature_descriptions\ready\F_017_search.md`
- `design\feature_descriptions\ready\F_010b_action_entry_points_and_popup.md`
