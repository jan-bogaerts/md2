---
author: 
id: F_435
internalId: 6636980d-0f8d-4f94-a4bb-b5a171ce8891
title: task progress indicator
status: ready
owner: 
affects:
agents:
  - design/activity/card__6636980d-0f8d-4f94-a4bb-b5a171ce8891.json
policy:
branch: f_435_task_progress_indicator
worktree: 2
---
We need to add a new component to the run button on the card popups when an action is running on the card that has a task list.

With task lists, we can show a progress bar to show how far along the agent already is. A task list, is a list, it has multiple items, so we can turn that into a progress bar.

Use a horizontal progress bar, just below the run button.

We need to be careful when loading the component, it doesn't need to be there on every run button, only those that are currently running an action.

The component should be stand alone, so it monitors the changes, it is not provided with the progress value, but with the info needed to identify task list to track.

## Current state

* `CardRunButton` (`app/src/components/actions/run/trigger/card_run_button.tsx`) is rendered in each board card by `project_card_view.tsx`. It subscribes to the card context's first active run through `useRunningActionForContext`; that summary contains `runId` and status, but no task-list data.
* A live task list is stored at `ActionRun.conversation.taskList`. Each `agentTaskList` update replaces that list in `ActionRunRegistry`, and `useRunSelector(runId, selector)` provides a run-scoped subscription.
* `AgentTaskList` (`app/src/components/actions/conversation/tasks/agent_task_list.tsx`) already shows the same model in the action popup and defines progress as completed tasks divided by all tasks. Board cards currently show only the animated running border around the Run button.

## Implementation details

* Add a standalone `TaskProgressIndicator` component beside `CardRunButton`. It receives only `runId`, selects `run.conversation.taskList` with `useRunSelector`, and computes `completed / total` itself. Do not pass task data or a computed percentage from the parent.
* Render a determinate MUI `LinearProgress` directly below the Run button. style it only with theme values from `design/STYLE_GUIDE.md`.
* The completed and total counts are shown in a tooltip. the progress should not display any text directly, it should use the minimal amount of space possible.
* Return `null` when the selected run has no task list or an empty task list. Task additions, removals, and status changes update the bar through the run-store subscription.
* In `CardRunButton`, mount the indicator only when the live run status is exactly `running`, passing `runningRun.runId`. Keep showing it for queued, waiting-for-input but do not show when idle, or terminal state.&#x20;
* Keep current button state priority, tooltip, click behavior, and scheduled indicator unchanged.
* Wrap the button and indicator in a compact vertical layout so the bar sits below the button without changing other footer controls. No task model, action protocol, persistence, registry, or desktop changes are needed.
* Add focused React Testing Library coverage for the new component and its `CardRunButton` integration. Run affected tests and `npm run lint` in `app`.

## Acceptance criteria

* While a card action has status `running` and a non-empty task list, a horizontal progress bar appears directly below that card's Run button.
* Progress equals completed task count divided by total task count; pending and in-progress tasks are not counted as completed.
* Bar updates when the active run publishes a replacement task list, without reopening the card or action popup.
* No bar appears for a missing or empty task list, or while run is queued, waiting for input, idle, or finished.
* Concurrent cards read their own active run by `runId`; one card's task updates do not change another card's bar.
* Existing Run button states, popup opening, schedule marker, and card footer controls keep current behavior.
* Progress bar exposes determinate value and completed/total context to assistive technology, works in light and dark themes, and focused tests plus app lint pass.
