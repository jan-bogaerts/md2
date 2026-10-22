---
author: 
id: F_444
internalId: 223f749a-dd16-4a42-b8de-3ce63eab686d
title: collaps task list when done
status: ready
owner: 
affects:
agents:
  - design/activity/card__223f749a-dd16-4a42-b8de-3ce63eab686d.json
policy:
after: 1a8109e1-2ead-482d-b6d0-c34fd94c0270
changedFiles:
  - app/src/components/actions/conversation/tasks/agent_task_list.test.tsx
  - app/src/components/actions/conversation/tasks/agent_task_list.tsx
---
When opening an action popup that contains a task list, but the list is completed, then collapse the task list by default.

## Current state

* `AgentTaskList` (`app/src/components/actions/conversation/tasks/agent_task_list.tsx`) renders the selected live or historical conversation's non-empty `taskList` inside `ActionConversationChat`.
* Header already shows completed and total task counts. Accordion uses `defaultExpanded`, so every task list starts expanded, including lists whose tasks are all completed.
* `ActionConversationChat` is the only `AgentTaskList` call site. Task-list updates already reach the component through its live-run and conversation-store subscriptions.

## Implementation details

* Define a **completed task list** as a non-empty list where every task has status `completed`.
* In `AgentTaskList`, set Accordion's initial expanded state from existing completed and total counts: start collapsed when both counts are equal; otherwise start expanded.
* Keep Accordion uncontrolled after its initial render. Completion while popup remains open must not force it closed, and user can expand or collapse it normally. Closing and reopening popup applies default again from current task statuses.
* Keep header progress count visible while collapsed. Do not change task data, live or historical subscriptions, action-popup layout, persistence, or desktop code.
* Update focused `AgentTaskList` tests. Verify completed lists start collapsed, incomplete lists start expanded, and manual toggling still works. Run affected test file and app lint during implementation.

## Acceptance criteria

* Opening action popup with non-empty task list whose every task is `completed` shows task rows collapsed by default.
* Opening popup with any `pending` or `inProgress` task shows task rows expanded by default.
* Collapsed header still shows `completed/total` count and remains accessible through existing `Toggle agent tasks` control.
* User can expand completed list and collapse or re-expand incomplete list.
* Task list becoming complete while popup is open does not override user's current expanded or collapsed choice. Reopening popup recalculates default from latest task statuses.
* Live and historical conversations behave same. Missing and empty task lists still render nothing.
