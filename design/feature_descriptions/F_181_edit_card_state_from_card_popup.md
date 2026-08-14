---
author: 
id: F_181
internalId: 7cc0a40b-58f2-463e-8872-62474c1a681f
title: Edit card state from card popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__7cc0a40b-58f2-463e-8872-62474c1a681f.json#conversation=agent-f5cb7e2a-bdbb-4005-9ea9-0e8855cea21b
  - design/activity/card__7cc0a40b-58f2-463e-8872-62474c1a681f.json#conversation=agent-b5574b33-17a6-4076-862e-ec770ba563bb
policy:
after: 6874b231-0cef-4a8a-8b0b-cc91f3daff42
---
We should make it easier for the user to change the state of a card from a card popup.&#x20;

At the bottom row where the delete button and such are, put a selector to change state.

On mobile, all current items on bottom bar are to the left. Put the selector to the right

## Current state

`CardBodyPopover` renders Delete, Affects, Open in file mode, usage, and Close controls in its footer. It receives card types and state colors, but not configured project states, so it cannot render a state selector.

Board drag handlers in `CardView` and `MobileCardView` are the current UI path for changing state. They call `dataService.cards.moveCard(path, targetState, targetIndex)`. `moveCard` updates `status` and `after` ordering fields, queues persistence, emits card-field changes, and triggers state-based actions. `useCardMetadata` already keeps each open popup synchronized with those granular card changes.

## implementation details

- Pass configured `StateConfig[]` from `CardView` and `MobileCardView` into `CardBodyPopover`.
- Add a focused card-state selector component to the popup footer. Use a labeled MUI `Select`; show current `card.header.status` and list configured states in configured order, with existing state colors.
- On selection of a different state, read latest active-card snapshot and call `dataService.cards.moveCard`. Use destination column card count as `targetIndex`, which appends card to end of destination column.
- Keep popup open after state change. Let existing card-field subscription update selected value and board columns.
- Do nothing when user selects current state. Report move failures through `dialogService` with card path in fallback message.
- Place selector after footer spacer. Desktop keeps Close control after selector. Mobile keeps existing action icons and usage on left while selector occupies right side.
- Add popup tests for configured options, current selection, append index, same-state no-op, error reporting, and desktop/mobile footer presence. Keep existing drag behavior unchanged.

## acceptance criteria

- Open card popup shows state selector in bottom row on desktop and mobile.
- Selector shows card's current state and every configured project state in configured order.
- Selecting different state moves card to end of destination column, persists existing `status` and ordering changes, and runs existing state-change side effects.
- Popup stays open and selector plus board update to new state without full project refresh.
- Selecting current state causes no move or persistence work.
- Move failure appears through `dialogService`; popup remains usable.
- On mobile, Delete, Affects, Open in file mode, and usage remain left; state selector is right-aligned.
- Existing card dragging, footer actions, title/body editing, and Close behavior remain unchanged.
