---
author: 
id: F_232
internalId: 545671dd-18d4-4878-93b9-0ed24f2077fa
title: assign default action to column
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__545671dd-18d4-4878-93b9-0ed24f2077fa.json
policy:
after: 06a8af54-38c9-4b9b-a9a4-bbdf563f036b
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup.tsx
  - app/src/components/actions/run/popup/action_popup_initial_action.node.test.ts
  - app/src/components/actions/run/popup/action_popup_initial_action.ts
  - app/src/data/data_types.ts
  - app/src/services/config/config_entries.ts
  - app/src/services/config/config_service.test.ts
  - app/src/services/config/config_service.ts
---
in the project config we are currently already able to define the  columns (or card states) used in the board view. Add option to provide an action id that would be presented as the default action when a card is in that column

when action popup opens for card, and no running or waiting action, check if column has preferred action, if so, go to that one instead of just the first

## Current state

Project config stores board columns in `ProjectConfig.states`. Each `StateConfig` contains `state`, `alwaysVisible`, and optional `color`; config validation preserves only those fields. Project settings expose this array through JSON editing, and desktop persistence serializes the complete project config without a separate schema.

`ActionPopup` filters loaded actions against current context, including card state, then calls `resolveInitialActionId` once when popup mounts. Selection priority is explicit action, queued/running action, waiting-for-input or unseen-result action, then first selectable action. **Unseen result** means completed or failed agent conversation whose persisted `viewed` field is `false`.

Card action context already contains card state. No configured column value currently affects popup selection.

## implementation details

* Add optional `defaultActionId` string to `StateConfig`. It identifies action by `ActionDefinition.id`; omission keeps current behavior. Update column config description and validation. Reject configured empty or non-string values, while preserving omitted values.
* In `ActionPopup`, for card context only, find state config whose `state` equals current card state and pass its `defaultActionId` to initial-action resolution. Project, file, folder, and merge-conflict popups have no column default.
* Extend initial-action priority to explicit action, queued/running action, waiting-for-input or unseen-result action, applicable column default, then first selectable action. **Applicable** means configured action exists in action selector after current-context filtering. Invalid, deleted, or inapplicable IDs fall through to first selectable action.
* Resolve selection only when popup mounts. Later card-state, config, run-state, or acknowledgement changes must not move user from selected action.
* Keep board rendering, column ordering, state selection, action order, direct action entry points, and desktop config persistence unchanged. Existing `StateConfig` consumers continue ignoring `defaultActionId`.
* Add config-service tests for preserving, omitting, and rejecting `defaultActionId`. Extend initial-action resolver and popup tests for priority, context scope, invalid IDs, and stable mounted selection. Run focused tests and app lint.

## acceptance criteria

* Project column JSON accepts optional non-empty `defaultActionId` and saves it in `md2.config.json`.
* Opening generic action popup for card selects matching column's applicable default action when no queued, running, waiting-for-input, or unseen-result action has higher priority.
* Explicit action entry point still selects requested action regardless of column default.
* Queued/running action remains higher priority than column default. Waiting-for-input and unseen-result action remain higher priority than column default.
* Missing, unknown, deleted, or context-inapplicable `defaultActionId` selects first applicable action instead of hiding or opening unavailable action.
* Column default never affects project, file, folder, or merge-conflict popup.
* Changing card state, project config, action status, or acknowledgement after popup opens does not change current selection automatically.
* Existing project configs without `defaultActionId` keep current popup behavior.
* Focused config and action-popup tests pass; app lint passes.