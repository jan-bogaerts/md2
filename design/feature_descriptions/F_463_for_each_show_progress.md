---
author: 
id: F_463
internalId: 6c76c3dc-b9d4-4b21-976f-4083499a8096
title: for-each show progress
status: ready
owner: 
affects:
agents:
  - design/activity/card__6c76c3dc-b9d4-4b21-976f-4083499a8096.json
policy:
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.tsx
  - app/src/components/actions/conversation/action_conversation_chat_integration.grouped.test.tsx
  - app/src/components/actions/conversation/tasks/for_each_progress_indicator.test.tsx
  - app/src/components/actions/conversation/tasks/for_each_progress_indicator.tsx
  - app/src/components/actions/run/trigger/task_progress_indicator.test.tsx
  - app/src/components/actions/run/trigger/task_progress_indicator.tsx
  - app/src/data/action_run_types.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
after: 9ee3f856-14a9-495a-88f7-a06cca186ac6
---
we recently added the 'for-each' functionality, see ( )

This is working, but we now need to add some progress indicator so that the user can see how far along we are in the list.

This should be a horizontal progress indicator (thin) just above the 'tasks' list.

We already have a progress indicator on the 'run' button on the action-cards. This should also indicate the progress in the for-each list.

## Current state

`ActionRun.executeAgentForEach` resolves the complete record list and processes it sequentially, so the desktop runner knows the current record index and total count. It does not publish this information.

`ActionRunRegistry` consequently has no loop-level progress state. The existing run-button indicator derives its value from the active agent conversation's task list, which describes work within one conversation and resets when a for-each run starts another conversation. The action popup renders this task list without a for-each progress indicator.

## Implementation details

Add a granular `forEachProgress` action-run update containing `processedCount` and `totalCount`. Publish `0/total` before the first record starts and publish an updated value after every processed record, including a failed record when the failure policy continues the loop.

Store the latest progress on the corresponding run in `ActionRunRegistry`. Clear it when the outer run becomes terminal; the final run event remains the authority for completion, failure, or cancellation.

Add a thin determinate progress indicator to the action conversation directly above `AgentTaskList`. Show it only for the active for-each run. Update the existing run-button indicator to prefer for-each progress while it is present and retain the current agent-task progress for ordinary runs.

Add focused tests for progress publication, registry updates, the popup indicator, and the run-button indicator. Cover successful iteration, continued record failure, stop-on-first-failure, cancellation, an empty list, and runs without for-each configuration.

## Acceptance criteria

- Starting a non-empty for-each run shows `0/total` progress in the action popup and on the action-card run button.
- The progress advances once after each processed record and reaches `total/total` when every record has been processed.
- A failed record counts as processed when the configured failure policy continues with the next record.
- A stop-on-first-failure or cancellation does not report unprocessed records as completed.
- The popup progress indicator is a thin horizontal determinate bar directly above the tasks list.
- The run-button indicator shows for-each progress during a for-each run and preserves its existing task-list behavior for other runs.
- Empty for-each lists complete without displaying invalid or indeterminate progress.
- Progress remains scoped to its action run and does not appear on another card or run.
