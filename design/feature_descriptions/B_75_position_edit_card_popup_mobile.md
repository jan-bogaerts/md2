---
author: 
id: B_75
internalId: 3e151ae1-ffa3-42ba-819c-a6973683af03
title: Position edit card popup mobile
status: ready
owner: 
affects:
agents:
  - design/activity/card__3e151ae1-ffa3-42ba-819c-a6973683af03.json#conversation=agent-91909559-05d3-498a-97e3-f1796a805b1e
policy:
after: 
---
On mobile, the ´edit card´ popup should take up the window size.

Buttons at bottom are not mobile friendly. Too much text.

## Current state

`CardBodyPopover` receives `isMobile`, but only uses it to make the editor toolbar sticky. Popup size remains the stored desktop size, resizing stays enabled, and footer shows four text buttons.

## Implementation details

- On the existing `md` mobile breakpoint, make popup fill viewport, remove margins and corner radius, and disable resizing and stored desktop sizing.
- Keep header close control and hide redundant footer `Close`.
- Render `Delete`, `Affects`, and `Open in file mode` as icon-only footer buttons with tooltips and matching `aria-label`s.
- Hide fullscreen toggle on mobile because popup already fills viewport. Keep desktop layout and behavior unchanged.
- Add responsive popup tests; update editor toolbar tests for mobile fullscreen-control visibility.

## Acceptance criteria

- Mobile edit-card popup fills available viewport without resize handles.
- Header, sticky editor toolbar, scrollable body, and footer remain usable without horizontal overflow.
- Mobile footer shows icon-only `Delete`, `Affects`, and `Open in file mode` actions with tooltips and accessible names; no footer `Close` button is shown.
- Popup still closes from header, `Escape`, or backdrop.
- Desktop popup sizing, resizing, fullscreen control, stored size, and text footer buttons remain unchanged.
