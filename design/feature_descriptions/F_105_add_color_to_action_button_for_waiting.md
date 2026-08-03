---
author: 
id: F_105
internalId: f9129167-19a8-4d52-8478-00f1423553d7
title: add color to action button for waiting
status: design
owner: 
affects:
agents:
  - design/activity/card__f9129167-19a8-4d52-8478-00f1423553d7.json#conversation=agent-14517190-5aea-47ef-ac67-71b484ead72c
policy:
after: 
---

When an agent-action is waiting for response of the user, on the action-popup, the action button shows a question mark icon in front of the action name on the button. this is ok, but to make it more clearly, we should show the button border in the same color as used for the 'run' button on the card.

## Current state

`ActionSelector` derives `waitingForInput` from active action runs and requests `warning.main` on the waiting button. However, the higher-specificity grouped-button styles on `ToggleButtonGroup` override it: unselected borders remain transparent and selected borders use `primary.main`. `CardRunButton` correctly uses `warning.main`. Existing popup tests cover waiting-state accessibility and transitions, but not the border color.

## implementation details

- Keep `waitingForInput` as the canonical trigger; do not infer waiting from conversation text.
- Add a waiting-state override with enough CSS specificity to beat the grouped-button default and selected styles.
- Use theme `warning.main` for the popup action button border in selected and unselected states, matching `CardRunButton`; add no raw color or new state.
- Preserve the question-mark icon, waiting tooltip and accessible name, and absence of the running animation.
- Preserve running, queued, selected, and unseen-result styling.
- Add focused `ActionSelector` coverage proving the waiting border wins in selected and unselected states.

## acceptance criteria

- Waiting action button in the popup has the same warning-colored border as the card's `Run` button in light and dark themes.
- Border remains visible whether the waiting action is selected or not.
- Waiting icon and accessible description remain present; running animation is absent.
- Other action states remain unchanged.
