---
author: 
id: F_479
internalId: f6820653-0398-4b52-a2ca-be1509597cda
title: no action buttons on run menu tab
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__f6820653-0398-4b52-a2ca-be1509597cda.json
policy:
---
we currently show all the 'global' actions on the 'run' menu-bar tab, in the list section, just before 'view active schedules'. these need to be removed.

## Current state

* `AppMenu` renders the shared desktop and mobile `Run` tab in `app/src/components/shell/menu/app_menu.tsx`.
* Its `Actions` section renders `ActionEntryPoints` with a project context and `visibility="explicit-context"`. This creates one icon button for every global action: an action whose `appliesTo.kind` is `project`.
* Selecting one of these buttons opens the action popup for that project action. `View active schedules`, `Complete release`, and the conditional `Import Sentry issues` controls follow these buttons.

## implementation details

* Remove `ActionEntryPoints` from the `Run` tab's `Actions` section. Do not move or replace these project-action buttons.
* Remove the now-unused `ActionEntryPoints` and `projectContext` imports and the `PROJECT_CONTEXT` constant from `app_menu.tsx`.
* Keep `AgentMenuControls`, `View active schedules`, `Complete release`, and `Import Sentry issues` unchanged. Do not change action matching, action popups, other action entry points, services, or desktop APIs.
* Replace the `app_menu.test.tsx` coverage that opens a project action from the `Run` tab with a regression test proving explicitly project-scoped actions are absent there. Existing `ActionEntryPoints` tests remain unchanged because the component is still used by other UI surfaces.

## acceptance criteria

* Desktop and mobile `Run` tabs show no buttons for actions whose `appliesTo.kind` is `project`.
* Loading one or many project-scoped command or agent actions does not add action buttons to the `Run` tab.
* `View active schedules` is the first control in the `Actions` section and still opens the active-schedules dialog.
* `Complete release` and eligible `Import Sentry issues` controls retain their current visibility, disabled states, and behavior.
* Project actions and action popups outside the `Run` tab are unchanged.
