---
author: 
id: F_190
internalId: dcb4a726-a5e7-46b9-8873-4daba86660b6
title: Small screen add btn first add card
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__dcb4a726-a5e7-46b9-8873-4daba86660b6.json#conversation=agent-33c7f6c7-f7bc-4cd7-9bb3-6d7a4f7b3c33
policy:
---

On the context menu shown when small screen and user clicked on + at top, put 'add card' first instead of 'add action'

# Current state

On small screens, `MainWindow` uses MUI's `theme.breakpoints.down('md')` breakpoint and passes mobile mode to `AppMenu`. While Home tab is active, plus-shaped **Create** button opens `MobileCreateMenu`. Menu currently lists **New action** first and **New card** second.

Each item has independent disabled state. Selecting **New action** closes menu, creates action, then opens it in text view. Selecting **New card** closes menu, then opens new-card dialog. Desktop Home toolbar already presents separate creation buttons and is outside this change.

# Implementation details

- In `app/src/components/shell/menu/mobile_create_menu.tsx`, render **New card** menu item before **New action**. Here, **first** means earlier visual and DOM position inside opened menu.
- Keep existing labels, handlers, disabled conditions, menu close timing, and Create-button behavior unchanged. No service, persistence, or dialog changes needed.
- Update `mobile_create_menu.test.tsx` to assert menu-item order. Keep coverage proving both handlers run and each item remains independently disabled.
- Keep `AppMenu` integration behavior and desktop creation-button order unchanged.

# Acceptance criteria

- On screens matching `theme.breakpoints.down('md')`, opening Home tab's plus-shaped **Create** menu shows **New card** as first item and **New action** as second item.
- **New card** opens new-card dialog after menu closes. **New action** creates action and opens it in text view after menu closes.
- Each item keeps current independent disabled state; disabling either item does not disable other item unless existing project or read-only conditions require it.
- Menu order remains **New card**, then **New action**, even when either item is disabled.
- Larger-screen Home toolbar and Run tab toolbar remain unchanged.
- Focused component test verifies exact item order, both callbacks, and independent disabled states.
