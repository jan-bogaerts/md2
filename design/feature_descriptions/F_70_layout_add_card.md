---
author: 
id: F_70
internalId: eb84b59c-5fc2-48d3-99bc-c4a59b504a7e
title: Layout add card
status: ready
owner: 
affects:
agents:
  - design/activity/card__eb84b59c-5fc2-48d3-99bc-c4a59b504a7e.json#conversation=agent-f5b898bd-6973-40cc-804a-1f18ac2775f3
  - design/activity/card__eb84b59c-5fc2-48d3-99bc-c4a59b504a7e.json#conversation=agent-15aa33b9-a2ab-4a2d-8a68-8f180ddfaacc
policy:
after: 
---
´add card layout needs improving. Especialy on mobile.

Things to change:

* Remove toolbar
* Card type and title on 1 row?
* Cardtype with icon only and select dropdown.
* Fix scrolling
* Buttons add bottom have too much text, specifically on mobile

## Current state

- `NewCardDialog` uses a fixed 480px dialog with card type, title, and body stacked vertically.
- Card type always shows a color dot and label. The body editor includes its full formatting toolbar.
- Dialog paper hides overflow, while its form/content lack a constrained flex layout. On short mobile viewports, body and footer can become inaccessible.
- Footer shows `Adds to New`, `Cancel`, and `Create card`, consuming too much mobile width.
- Same dialog is opened from desktop project controls, mobile create menu, and board-column add buttons.

## implementation details

- Keep `NewCardDialog` and existing card creation flow; change only its responsive layout.
- Remove Markdown formatting toolbar with `MarkdownEditor`'s existing `hideToolbar` prop.
- Put card type and title on one row. On mobile, render only selected type's color icon in closed select; keep labels in dropdown options and accessible naming. Desktop may show icon and label.
- Make dialog form a height-constrained flex column. Keep header/footer fixed and make `DialogContent` scroll with `minHeight: 0`.
- On mobile, hide `Adds to New` and render cancel/create as icon-only buttons with tooltips and matching `aria-label`s. Desktop may keep current text.
- Add responsive tests in `project_dialogs.test.tsx`; keep configured custom card types and existing submit behavior unchanged.

## acceptance criteria

- Card type and title share one row without horizontal overflow on mobile.
- Mobile closed type select shows only its icon; dropdown options remain readable and selectable. Desktop may show icon and label.
- Body editor has no formatting toolbar; Markdown typing and Ctrl/Cmd+Enter submission still work.
- On short mobile viewports, dialog body scrolls while header and footer remain reachable.
- Mobile footer contains icon-only cancel/create actions with tooltips and accessible names; `Adds to New` is hidden.
- Desktop layout remains usable, and card creation still supports every configured card type.
