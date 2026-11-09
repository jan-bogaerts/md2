---
author: 
id: B_364
internalId: fecd4bcd-90cc-417a-acc4-7f240de40d71
title: indicate for-each loop is running
status: ready
owner: 
affects:
agents:
  - design/activity/card__fecd4bcd-90cc-417a-acc4-7f240de40d71.json
policy:
branch: b_364_indicate_for_each_loop_is_running
worktree: 1
changedFiles:
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
---

After the first record, the action popup no longer shows the status of the conversation.&#x20;

* the action button at the top of the action popup is not animated as usual
* there is no 'stop' button, the input seems to think the converation is done.
* the conversation log is not updating. we need to close the popup and open it again to update the log

## Current state

The desktop runs all for-each records sequentially. When the first record finishes, it publishes an `agentClosed` update with status `completed`. The renderer applies that status to the entire action run and then rejects later non-terminal events. The popup therefore stops showing the running state, hides the Stop button, and no longer receives live conversation updates. Reopening the popup loads the completed conversation from persisted activity.

## Implementation details

Update `ActionRunRegistry` so an `agentClosed` update replaces the conversation and its terminal metadata without making the outer action run terminal. Only the final `run` event may set the action run to `completed`, `failed`, or `cancelled`. Keep accepting subsequent `agentStarted`, agent state, and conversation events from later for-each records. Add a registry regression test that publishes `agentClosed` followed by another record's `agentStarted` and output events on the same run.

## Acceptance criteria

* The action button remains animated while later for-each records are running.
* The Stop button remains available until the complete for-each run reaches a terminal state.
* The conversation log updates live for every for-each record without reopening the popup.
* An `agentClosed` update retains the closed conversation's terminal metadata without terminating the action run.
* The final `run` event still changes the action run to its terminal status.
