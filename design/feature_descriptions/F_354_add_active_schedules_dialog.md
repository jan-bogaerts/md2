---
author: 
id: F_354
internalId: 57ceeeca-6732-42a3-b77f-b1c459a2f268
title: Add active schedules dialog
status: ready
owner: 
affects:
agents:
  - design/activity/card__57ceeeca-6732-42a3-b77f-b1c459a2f268.json
policy:
after: 67d4a581-6ded-4a41-a489-d079644e3e5b
changedFiles:
  - app/src/components/actions/run/popup/action_popup_defaults.node.test.ts
  - app/src/components/actions/run/popup/action_popup_defaults.ts
  - app/src/components/actions/run/schedule/active_schedules_dialog.test.tsx
  - app/src/components/actions/run/schedule/active_schedules_dialog.tsx
  - app/src/components/hooks/use_active_schedules.ts
  - app/src/components/project_workspace.tsx
  - app/src/components/project_workspace_rendering.test.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/app_menu.tsx
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/active_schedule_projection.node.test.ts
  - app/src/services/actions/active_schedule_projection.ts
  - app/src/services/actions/active_schedule_service.node.test.ts
  - app/src/services/actions/active_schedule_service.ts
  - app/src/services/application_startup_service.ts
  - app/src/services/card_popup_service.test.ts
  - app/src/services/card_popup_service.ts
  - app/src/services/project/workspace_navigation_service.node.test.ts
  - app/src/services/project/workspace_navigation_service.ts
---
Add active-schedule management UI for [F\_331](F_331_improve_schedule_action.md), using APIs from [F\_352](F_352_extend_schedule_contract_and_apis.md).

## Current state

Run tab contains agent setup and action buttons only. Schedules can be loaded through data storage, but no service owns live schedule view data and no screen lists them. Workspace navigation opens paths; board reveal selects and scrolls card, while list view opens documents in tabs.

## implementation details

* Add `View active schedules` to Run tab and open MUI dialog. Dedicated schedule service loads active records when project opens, refreshes after registration/deletion and `.md2-schedules.json` changes, and exposes stable schedule list through `EventTarget` plus `useSyncExternalStore`.
* Show one selectable row per pending or running record. Expand row for kind, action, status, trigger, creation time, selected tracker or trigger card, ready state, sequence progress, and unavailable reason. Resolve labels and current paths from loaded actions/cards; retain IDs when target disappeared.
* `Open` and row double-click resolve current target by `cardInternalId`. For action schedule use action context card; for sequence use current item, or first item before start. Board view selects, scrolls, and opens card details. List view opens or activates card tab. Missing card reports through `dialogService`.
* `Delete` asks confirmation, calls delete API, disables repeated action while pending, then updates list. Running deletion text states current action will be cancelled.
* Dialog follows style guide: scrollable body, pinned right-aligned actions, one contained primary action at most, accessible expansion and selection, empty state.
* Add menu, service, dialog, navigation, deletion, missing-target, empty, and error tests.

## acceptance criteria

* Run menu opens dialog containing every active action and sequence schedule, and no terminal schedule.
* Selection and expansion work independently; details identify exact trigger and current sequence progress.
* Open button and double-click reveal and open correct current card in board view, or open correct tab in list view.
* Navigation resolves `cardInternalId` to current path, so rename does not break Open.
* Confirmed delete cancels running work when needed, removes schedule, and removes row. Cancel leaves it unchanged.
* Missing action, card, or tracker remains inspectable and produces clear unavailable state instead of render error.
