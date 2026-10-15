---
author: 
id: F_434
internalId: e92bddab-43a2-497f-8493-cfa6f39a089e
title: agent task list component
status: design
owner: 
affects:
agents:
policy:
after: bdfd6fc4-a938-4be2-86c7-2d8f92c55d96
---

Part of [F_380](F_380_add_possibility_to_support_task_tracking_tool.md). Show `conversation.taskList` from [F_431](F_431_agent_task_list_model_and_run_update.md) in the conversation chat.

## Current state

* `ActionConversationChat` (`app/src/components/actions/conversation/action_conversation_chat.tsx`) lays out the transcript, status area and prompt.
* Live conversations come from the run store in `action_run_registry.ts`; historical ones from `ActionConversationStore` (`resolveDisplayedConversation`).

## Implementation details

* New self-contained component `AgentTaskList` in `app/src/components/actions/conversation/tasks/agent_task_list.tsx`. It receives only what identifies the displayed conversation and subscribes itself with `useSyncExternalStore`; `getSnapshot` returns `conversation.taskList` (a stable reference that changes only on `agentTaskList`). No task data or handlers come from the parent, so it can be moved elsewhere later.
* Initial placement: in `ActionConversationChat`, directly above the prompt.
* Renders nothing when there is no list or it is empty.
* Each row: status icon (pending / in progress / completed) and text; an in-progress task shows `activeForm` when present, otherwise `subject`. Header shows `completed/total`. Collapsible, expanded by default, compact height with scrolling for long lists.
* Styling per `design/STYLE_GUIDE.md` and the existing conversation status components.
* Works the same for live and historical conversations.

## Tests

React Testing Library:

* Renders tasks with their states and the progress count.
* Shows `activeForm` for the in-progress task.
* Renders nothing without a task list.
* Updates when an `agentTaskList` update arrives.
