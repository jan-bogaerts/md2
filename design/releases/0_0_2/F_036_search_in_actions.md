---
id: F-036
title: option to search in actions
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: c38d16f4-947b-4860-85b7-3058ae6ec360
---

## Goal
Add optional action search over loaded definitions: label, description, name, prompt, and command.

## Current state
Search only covers project cards: `searchProject` (`app/src/services/search/search_project.ts`) matches active/background card headers and bodies. `SearchOptions` (`app/src/services/search/search_types.ts`) has no action flag and `actionService.getActions()` is never consulted by search. The architecture note (`design\architecture\initial description\search.md`) lists this as "perhaps also option to search in actions".

## implementation details
- Extend `SearchOptions` with `includeActions: boolean` (default off) and add a toggle to the search options popover in `SearchControl`, next to the existing background-body toggle.
- Add a pure `searchActions(actions, query, options)` matching `label`, `description`, `name`, `prompt`, and `command` with the same text/regexp matcher used for cards.
- Extend `SearchResults` with an `actions: ActionSearchMatch[]` group rendered below the background groups in `SearchResults`, titled "Actions".
- In card view, selecting an action result opens its popup by action id with the current supported context. In text view, it opens the action editor tab, matching the action-editor navigation contract.
- Keep the search module free of service imports: `MainWindow`/`SearchControl` passes the current actions in, same pattern as the snapshot.

## acceptance criteria
- With the toggle off, results are unchanged from today.
- With the toggle on, a query matching an action's label, description, name, prompt, or command shows it under `Actions`; text and regexp modes both work.
- Selecting a result follows the card-view popup/text-view editor navigation contract.
- Tests cover matching per field, regexp mode, and the off-by-default behavior.

## see also
- `design\architecture\initial description\search.md`
- `design\feature_descriptions\ready\F_017_search.md`
- `design\feature_descriptions\ready\F_010b_action_entry_points_and_popup.md`
