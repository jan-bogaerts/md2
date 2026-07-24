---
id: F-030
title: action entry point display
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Complete the action display rules from `actions.md`: render the configured `icon` of an action on its entry-point buttons, and offer actions on cards through a context menu in addition to the inline icon buttons.

## Current state
`ActionEntryPoints` (`app/src/components/actions/action_entry_points.tsx`) renders every card action as a generic Play icon and every file/folder action through a DotsVertical overflow menu. The `icon` field is parsed and validated by the action loader (`action_definition_loader.ts`) but never used by any component. Cards have no context menu at all — the design lists "small icon buttons, in context menu, menu items" for cards.

## implementation details
- Icon rendering: support the documented forms — an inline SVG string and a project-relative path to an svg/image asset. Sanitize/limit inline SVG (no scripts/foreign objects); load path-based icons through the storage layer (or as data URI) so GitHub mode works too. Fall back to the current Play icon when `icon` is absent or fails to load.
- Apply the icon in both variants: card icon buttons and menu items (menu items show icon + label).
- Card context menu: right-click (and long-press on touch) on a card opens a context menu containing the matching actions (same `appliesTo` filtering), plus existing card commands (open body, open in file mode, edit title — and delete once F-025 lands).
- Keep entry-point behavior otherwise unchanged: activation opens the resizable action popup with the card context.

## acceptance criteria
- An action with an `icon` shows that icon on card buttons and in menus; actions without one keep the default icon.
- A malformed or unresolvable icon falls back to the default icon without breaking the action list.
- Right-clicking a card opens a context menu listing the context-matching actions; selecting one opens the action popup.
- Inline SVG icons cannot inject active content.
- Tests cover icon resolution (inline, path, fallback), sanitization and the card context menu flow.

## see also
- `design\architecture\initial description\actions.md`
- `design\feature_descriptions\F_010b_action_entry_points_and_popup.md`
