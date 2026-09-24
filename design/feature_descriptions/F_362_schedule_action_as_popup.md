---
author: 
id: F_362
internalId: faf847ea-ef5f-4ace-a894-9a30c39692b4
title: schedule action as popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__faf847ea-ef5f-4ace-a894-9a30c39692b4.json
policy:
branch: f_362_schedule_action_as_popup
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.grouped.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/schedule/action_schedule_form.test.tsx
  - app/src/components/actions/run/schedule/action_schedule_owner.test.tsx
  - app/src/components/actions/run/schedule/action_schedule_owner.tsx
  - app/src/components/actions/run/schedule/action_schedule_store.node.test.ts
  - app/src/components/actions/run/schedule/action_schedule_store.ts
  - app/src/components/actions/run/schedule/action_schedule_trigger.node.test.ts
after: 515b2369-553d-4556-b99c-e01eb575777d
---

we have a 'schedule' button on the action popup. currently it shows / hides a box on the same popup when clicked. This should be moved into a popup. when the user clicks on the schedule icon, open/close the new popup.

## Current state

`ActionPopupBottomRow` renders the Schedule icon and calls `ActionScheduleStore.toggle()`. `ActionScheduleStore` owns whether scheduling is open, trigger-specific drafts, and the registration message through `EventTarget`; each selected action gets its own store from `createActionPopupBindings`.

`ActionScheduleOwner` subscribes with `useSyncExternalStore`. When open, it renders `ActionScheduleForm` inline inside the action popup scroll body through both `AgentAction` and `CommandAction`. Opening scheduling therefore consumes action-popup body space and can move or compress conversation, prompt, status, and history content.

The form already supports date/time, account-reset, and card-state triggers. Registration uses the original `baseContext`, refreshes active schedules through `defaultScheduleAction`, keeps success text inline, and reports backend failures through `dialogService`.

## implementation details

* Define the new popup as an MUI `Popover` anchored to the Schedule icon. It is a separate floating surface inside the existing action popup, not a modal dialog or browser window.
* Keep popup visibility and anchor element in `ActionScheduleStore`; do not add React-owned duplicate state. Opening stores the clicked icon element, and closing clears it. Keep trigger drafts when the popup closes, but clear stale registration text as current toggle behavior does.
* Change the Schedule icon handler to pass `event.currentTarget` to the store. Clicking the closed icon opens the popover; clicking it while open closes the popover. Backdrop click and `Escape` also close only the schedule popover. Expose popup state with `aria-haspopup` and `aria-expanded`.
* Render `ActionScheduleOwner` through the popover portal instead of inline layout. Keep its current placement in `AgentAction` and `CommandAction` so registration still receives `baseContext`; `assignmentContext`, including a selected worktree, must not silently replace that scheduling context.
* Give the popover an accessible `Schedule action` label, viewport-safe width, theme-based padding, `background.paper`, divider border, and popup elevation. The existing `ActionScheduleForm`, trigger controls, validation, submit button, success message, and `dialogService` error path remain unchanged.
* If the Schedule control becomes unavailable because run state changes, close the popover so it never remains attached to a removed icon. Closing the parent action popup or switching actions also removes the schedule popover with that action's runtime.
* Update store tests for anchor/open/close events and retained drafts. Update owner and action-popup tests to prove the form is rendered in a popover, is absent from the action-popup scroll layout, toggles from the icon, closes on `Escape` and backdrop click, and preserves registration success/error behavior. No desktop scheduler, persistence contract, or bridge change is required.

## acceptance criteria

* Clicking an available Schedule icon opens one popover anchored to that icon; clicking the icon again closes it.
* `Escape` and clicking outside close the schedule popover without closing the parent action popup.
* Schedule controls no longer occupy or resize the action popup scroll body.
* Popover offers the same date/time, account-reset, and card-state choices, validation, and registration behavior as the current inline form.
* Closing and reopening preserves entered trigger drafts but removes stale registration text.
* Registration uses the same action and original card or project context used before this change. Card identity remains `cardInternalId`; paths remain persistence locations only.
* Successful registration still refreshes active schedules and shows `Schedule registered`. Failure keeps the popover usable and reports through `dialogService`.
* Popover closes if its Schedule icon disappears, the selected action changes, or the parent action popup closes.
* Schedule icon exposes expanded state to assistive technology, and schedule popover has an accessible `Schedule action` label.
* Existing action-popup and scheduling tests pass with new popover/store coverage.
