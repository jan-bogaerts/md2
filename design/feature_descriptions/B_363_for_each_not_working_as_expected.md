---
author: 
id: B_363
internalId: 18a123cb-87d4-4e30-883c-6336b8eaa574
title: for-each not working as expected
status: ready
owner: 
affects:
agents:
  - design/activity/card__18a123cb-87d4-4e30-883c-6336b8eaa574.json
policy:
changedFiles:
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/actions/agent/agent_streaming_event_handlers.js
---
we used the 'custom' or '+' action on the card which uses a streaming agent. We also used a for-each file with the action so that it should loop over every record in the file. The file contains an object, but we specified a path in the 'for-each' setup to the field that contains the actual array data. this worked for the first record, but then the conversation went into 'waitingForInput' mode. So I pressed the stop button and then the entire for-each loop stopped.

So, not certain what caused the termination: the stop button? or waitingForInput?

For a 'streaming' action, we might need a way to signal the end of the conversation, for instance, a text that appears in the conversation log (something the agent says to indicate he is done)

## Current state

The selected data path is resolved correctly and the for-each loop receives every record. After the first streaming turn completes, the agent enters `waitingForInput`, so the loop remains blocked on that record. `waitingForInput` does not terminate the loop. Pressing Stop cancels the complete action run and therefore discards all remaining records.

The existing for-each tests use agent executions that complete immediately. They do not cover the streaming transition from a completed turn to `waitingForInput`.

## Implementation details

Treat a successful streaming turn completion as the end of the current record when for-each is active. Finish the active agent session automatically so that `executeAgentForEach` receives its result and advances to the next record. Preserve the existing continuation behavior for Add prompt and Compact modes and the separate-conversation behavior for New conversation mode.

Use the provider's explicit turn-completed event. Do not infer completion from assistant text or from `waitingForInput`, because questions and approval requests also use that state. A pending question or approval must continue waiting for user input. Stop must continue to cancel the entire for-each run.

Add regression coverage for multiple streaming records, all three for-each modes, pending interactions, both failure policies, and cancellation.

## Acceptance criteria

- A streaming for-each action automatically advances after each successful record.
- Every record selected through a data path is processed in order.
- Add prompt and Compact reuse the conversation as currently defined, while New conversation creates a conversation per record.
- Agent questions and approval requests wait for user input and do not advance the loop.
- Stop cancels the active record and all remaining records.
- Existing failure policies continue to log and continue or stop on the first failure.
- Completion is based on the provider turn-completed event, not on matching assistant text.
