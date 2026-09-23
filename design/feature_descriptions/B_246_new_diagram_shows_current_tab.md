---
author: 
id: B_246
internalId: 568c6713-9e89-444e-910f-d43e00b032b9
title: new diagram shows current tab
status: ready
owner: 
affects:
agents:
  - design/activity/card__568c6713-9e89-444e-910f-d43e00b032b9.json
policy:
branch: b_246_new_diagram_shows_current_tab
changedFiles:
  - app/src/components/diagram_view/diagram_legend.tsx
  - app/src/components/diagram_view/diagram_menu_tab.test.tsx
  - app/src/components/diagram_view/diagram_menu_tab.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/diagram_view/diagram_view.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/services/diagrams/diagram_edit_session_service.test.ts
  - app/src/services/diagrams/diagram_edit_session_service.ts
  - app/src/services/diagrams/diagram_save_service.test.ts
---

when creating a new diagram, there is no current diagram yet. pointless to show this.

## Current state

`New diagram` persists an empty root diagram, makes it active, and starts an edit session from that saved source. The edit session therefore has a `Current` source even though the user has not made a prior diagram. `DiagramView` shows the comparison layout whenever an edit session exists. Tabbed comparison initially selects `Current`; desktop split layouts show both sides. The floating legend and Diagram menu also expose `Current` during editing.

## implementation details

* Mark only the edit session started by successful `New diagram` creation as a creation session. Keep this distinction in `DiagramEditSessionService`, tied to its source record ID; do not infer it from empty nodes or the `user-created` index group, because those can describe diagrams opened for later editing. Clear the distinction when the session ends or another source starts.
* In a creation session, render the editable `New` diagram as the sole diagram surface in `DiagramView`, independent of screen size and stored comparison mode. Hide comparison tabs, split panes, resize controls, and the comparison layout selector. Keep edit tools and save-copy behavior available.
* In the floating legend, show only the edit session's legend entries, without a `Current` tab. Hide `Current` formatting controls in the Diagram menu. Other edit sessions retain both sides and existing layout choices.
* Add focused regression tests for desktop and mobile creation, prior comparison selection, source changes, and ordinary edits. Verify that ending a creation session restores normal read-only display and that editing an existing diagram retains `Current`.

## acceptance criteria

* Immediately after creating any empty diagram type, editor shows its editable diagram; no empty `Current` surface, `Current` tab, `Current` legend tab, `Current` formatting controls, or comparison layout selector appears.
* Changing screen size or previously selected comparison mode does not reveal `Current` during that creation session.
* Saving changes still creates an edited copy using the existing persistence flow. Discarding or leaving the session removes creation-only presentation state.
* Starting a later edit session on the saved diagram, or editing an agent-created diagram, shows normal `Current` and `New` comparison UI.
* Focused UI and session tests pass; app type checking and `npm run lint` pass.
