---
author: 
id: F_190
internalId: dcb4a726-a5e7-46b9-8873-4daba86660b6
title: Small screen add btn first add card
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__dcb4a726-a5e7-46b9-8873-4daba86660b6.json
policy:
after: 4191dc0a-7628-45bf-ada1-b1366e9f05f9
---

On the context menu shown when small screen and user clicked on + at top, put 'add card' first instead of 'add action'

# Current state

On small screens, `MainWindow` uses MUI's `theme.breakpoints.down('md')` breakpoint and passes mobile mode to `AppMenu`. While Home tab is active, plus-shaped **Create** button opens `MobileCreateMenu`. Menu currently lists **New action** first and **New card** second.

Each item has independent disabled state. Selecting **New action** closes menu, creates and saves action, switches workspace to text view, then opens action. Selecting **New card** closes menu, then opens new-card dialog. Desktop Home toolbar uses separate creation buttons and remains outside this change.

# Implementation details

- In `app/src/components/shell/menu/mobile_create_menu.tsx`, render **New card** menu item before **New action**. Here, **first** means earlier visual and DOM position inside opened menu.
- Keep existing labels, handlers, disabled conditions, menu-close timing, and Create-button behavior unchanged. No service, persistence, or dialog changes needed.
- Update `mobile_create_menu.test.tsx` to assert exact menu-item order. Keep coverage proving both handlers run and each item remains independently disabled.
- Keep `AppMenu` integration behavior, desktop creation-button order, and Run toolbar unchanged.

# Acceptance criteria

- On screens matching `theme.breakpoints.down('md')`, opening Home tab's plus-shaped **Create** menu shows **New card** first and **New action** second.
- **New card** closes menu before opening new-card dialog. **New action** closes menu before creating and saving action, switching to text view, and opening action.
- Each item keeps current independent disabled state. Disabling either item does not disable other item unless existing project or read-only conditions require both to be disabled.
- Menu order remains **New card**, then **New action**, when either or both items are disabled.
- Larger-screen Home toolbar and Run toolbar remain unchanged.
- Focused component test verifies exact item order, both callbacks, and independent disabled states.
