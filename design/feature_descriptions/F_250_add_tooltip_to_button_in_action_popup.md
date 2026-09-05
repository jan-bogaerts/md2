---
author: 
id: F_250
internalId: b46b8f66-e2f3-469f-ac38-48b26dedccab
title: add tooltip to button in action popup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__b46b8f66-e2f3-469f-ac38-48b26dedccab.json
policy:
after: 9d5878e6-2d20-4574-971d-57dbd82eb389
---
send: ctrl+ enter.

## Current state

`ActionPopupBottomRow` in `app/src/components/actions/run/popup/action_popup_bottom_row.tsx` renders agent Send as an icon-only MUI `IconButton`. Its tooltip says only `Send`, although `ActionAgentPrompt` already submits through `Ctrl+Enter` (and `Meta+Enter` on platforms using the Meta key). Disabled Send buttons remain wrapped in a `span`, so their tooltip can still open.

## Implementation details

- Change Send tooltip text in `ActionPopupBottomRow` to `Send. Ctrl+Enter.` so it names both action and keyboard shortcut.
- Keep Send `aria-label="Send"`; shortcut text is guidance, not part of control name.
- Keep existing `span` wrapper, visibility, disabled-state, click, `Ctrl+Enter`, and `Meta+Enter` behavior unchanged.
- Update focused `ActionPopupBottomRow` tooltip coverage. No desktop, service, state, or data-model change needed.

## Acceptance criteria

- When user hovers or focuses visible Send button, tooltip shows `Send. Ctrl+Enter.`.
- Tooltip remains available when Send button is disabled.
- Clicking enabled Send and pressing `Ctrl+Enter` submit exactly as before.
- `Meta+Enter` behavior remains unchanged.
- Send accessible name remains `Send`; other action-popup controls and tooltips remain unchanged.
