---
id: F-005
title: card view
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Show markdown files as status columns with draggable, ordered cards. Cards expose type color, `id`, title, policy leds, inline title editing, body access, and a switch to file mode.

## Current state
Parsing now lives behind the shared `markdownParsingService` ([[F-021]]), whose `parseCard`/`splitCards` create `ProjectCard`s that `DataService` can save. `CardTypeConfig` already carries a per-type `color` (added with theming, [[F-018]]). `CardHeader` has `id`, `title`, `status`, `owner`, `affects` and `internalId`, but not parsed `after` ordering or `policy`. `ProjectWorkspace` still shows active cards as a flat `CardSelectButton` list with a plain `TextField` textarea editor — no columns, drag-and-drop, policy leds, type-color line, inline title editing, or body dialog/accordion. No drag-and-drop library is installed.

## Implementation
- Data model: parse `after` and `policy` in the shared parsing service, add them to `CardHeader`, and keep `internalId` as the stable identity referenced by `after`. Extend `CardTypeConfig` with a per-type color.
- Layout: host the view in the app shell ([[F-004]]), optimized for desktop and mobile. Render one column per distinct `status`; column title is the status, and each card appears in its matching column.
- Card chrome: show a vertical type-color line before the card, then `id`, title, and upper-right policy leds. Clicking a policy led toggles that policy and persists through `DataService.saveFile`.
- Ordering: derive column order from `after`, where `after` stores the preceding card's `internalId`. Dragging within a column updates `after`; dragging between columns updates `status` and `after`. Use `@dnd-kit` (`@dnd-kit/core` + `@dnd-kit/sortable`, with `@dnd-kit/modifiers` as needed) for drag-and-drop — chosen for built-in touch/pointer support (desktop + mobile), a sortable model that fits cross-column moves, and its lightweight, TypeScript-native, accessible API. On drop, persist only the two/three cards whose `after` values changed.
- Editing/navigation: double-click or edit affordance enables inline title editing, updates `header.title`, and saves. Clicking a card opens the markdown body in a desktop dialog or expands it inline as a mobile accordion; body editing and toolbar behavior come from the markdown editor ([[F-007]]). A card/dialog action switches to file mode ([[F-006]]) with that card open.

## Acceptance Criteria
- Cards are grouped into columns by `status`, one column per distinct status value.
- Each card shows its type color line, `id` before the title, the title, and policy leds; clicking a led toggles the policy and persists the change.
- Dragging a card to another column changes its `status`; dragging within a column reorders it, and only the affected cards' `after` values are written.
- Card order is derived from the `after` tag and survives reload.
- The title can be edited inline and is persisted.
- On desktop, clicking a card opens its body in a dialog; on mobile, the card expands as an accordion with the body inline.
- A card action switches to file mode with that card open.
- The view works on both desktop and mobile.

## See Also
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\app layout.md`
- `design\architecture\parsing_service.md`
