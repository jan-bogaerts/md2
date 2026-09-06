---
author: 
id: B_208
internalId: 3f00b054-71c0-4d3f-abd5-0148f716b536
title: diagrams no action popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__3f00b054-71c0-4d3f-abd5-0148f716b536.json
policy:
changedFiles:
  - app/src/components/agents/agent_chat_fab.test.tsx
  - app/src/components/agents/agent_chat_fab.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/movable_fab.test.tsx
  - app/src/components/movable_fab.tsx
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
after: ed8ce460-5ff7-46f0-8bf2-09764585b8b2
---

for diagrams: there is a fab button for the diagrams, but can't move it, when clicking on it, doesn't do anything: popup is not opened.

## Current state

`DiagramView` renders a fixed diagram FAB after `DiagramViewService` reaches `ready`. FAB has no drag handling. Click stores a root diagram popup in service state, then `DiagramView` renders `ActionPopup` without its `draggable` option.

`ActionPopup` renders nothing when no action matches `{ kind: 'diagram', type: 'root' }`. Diagram FAB remains enabled in that case, so click has no visible result. Current Diagram view test mocks `ActionPopup` and always returns a dialog; it therefore misses real empty-action behavior and popup integration. Project-agent FAB already supports pointer dragging, viewport clamping, click-after-drag suppression, click toggling, and a draggable popup.

## implementation details

* Extract project FAB's pointer behavior into one reusable movable FAB component: pointer capture, 5-pixel drag threshold, viewport clamping, click suppression after drag, and plain-click activation. Keep project-agent behavior unchanged and use same component for diagram FAB.
* On diagram FAB drag, close any open diagram popup before moving launcher. A drag must never also activate launcher.
* Compute matching root diagram actions in `DiagramView`. Enable launcher only when at least one exists. When none exists, keep launcher visible but disabled and show tooltip `No root diagram actions configured`; this replaces silent click with defined state without exposing generic or child actions.
* Make plain diagram FAB click toggle root popup through `DiagramViewService`: first click opens `{ kind: 'diagram', type: 'root' }` anchored to FAB; next click closes it. Keep child popup behavior unchanged.
* Pass `draggable` to diagram `ActionPopup`. On desktop, popup header can move popup independently from FAB. Existing `ActionPopupFrame` already disables popup dragging on mobile.
* Add focused tests for reusable FAB drag/click behavior, unchanged project FAB behavior, diagram FAB movement, root popup open/close with real matching actions, disabled no-root-action state, and draggable diagram popup. Run affected app tests and app lint.

## acceptance criteria

* While Diagram view is ready and at least one root diagram action exists, plain FAB click opens action popup with only matching root diagram actions. Second plain click closes it.
* Pointer movement of at least 5 pixels moves diagram FAB within viewport and does not open popup. Following plain click opens popup from new FAB position.
* Dragging open diagram popup by its header moves popup on desktop. Popup remains full-screen and non-draggable on mobile.
* When no root diagram action exists, diagram FAB stays visible, is disabled, and explains `No root diagram actions configured`; click never fails silently.
* Child diagram menus, child popup selection, completed-run handling, diagram persistence, and project-agent FAB behavior remain unchanged.
* Focused app tests pass and app lint reports no errors or warnings.
