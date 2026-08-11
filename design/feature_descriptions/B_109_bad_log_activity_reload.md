---
author: 
id: B_109
internalId: c1af41da-7012-48b8-a985-64cc138f8baa
title: Bad log activity reload
status: ready
owner: 
affects:
agents:
  - design/activity/card__c1af41da-7012-48b8-a985-64cc138f8baa.json#conversation=agent-2897d0de-5db5-41a3-91d0-0283bb184141
  - design/activity/card__c1af41da-7012-48b8-a985-64cc138f8baa.json#conversation=agent-4ff47e91-99ee-4819-9fd5-6cef0e70bdd2
policy:
---
An active or just-completed agent conversation can revert in the UI to the transcript that was loaded when the project opened. This has been observed repeatedly for agents running in the main project folder.

## Investigation

The activity writer in `desktop/src/actions/activity/activity_files.js` serializes backend writes per file and rereads the file inside that queue. Recent Git history contains no committed conversation or activity-record shrinkage, so the observed rollback is not caused by the writer comparing schema versions or timestamps.

The stale value comes from the renderer's project-load cache:

1. `AgentIntegration.repairProjectActivity` loads every referenced activity file and retains full conversation snapshots in `repairedConversationsByReference`.
2. That cache remains available after project loading completes while the backend continues updating the activity file for an active conversation.
3. When an action reaches a terminal state, `linkActionConversation` calls `loadLinkedAgentConversation`.
4. `loadLinkedAgentConversation` prefers the project-load snapshot over `storage.loadAgentConversation`, then `upsertAgentConversation` publishes that older conversation as current.
5. The live `ActionRunStore` temporarily masks the stale value. Once the terminal run store is released, reopening or reloading the conversation exposes the older cached transcript.

A second ordering problem can produce the same result. If the initial background conversation load finishes after a newer conversation was already inserted, `mergeAgentConversations` lets the older loaded value overwrite the existing value for the same conversation ID.

This is a freshness/ownership bug: repair output is valid only for the project-load operation that produced it. It is not a newer conversation source and must not replace live or freshly persisted data.

## Required change

- Use repaired conversation snapshots only while resolving the initial project load.
- On dynamic conversation linking after an action update, load the conversation from storage after backend persistence instead of consulting `repairedConversationsByReference`.
- When a background load is merged with conversations inserted after that load began, preserve the existing conversation on matching IDs.
- Keep the backend per-file activity write queue unchanged; its call sites require the current serialized behavior.

## Failure cases

- A continued conversation is most exposed because its ID already exists in the project-load cache; a new conversation normally misses the cache and falls through to storage.
- A fast terminal update can still be reverted by a slower initial background load unless merge precedence is corrected as well as dynamic linking.
- Project reload, action completion, popup close/reopen, and delayed background loading can change when the stale transcript becomes visible, making the issue appear intermittent.
- The fix must preserve repaired legacy activity data during the initial load and must not allow an older background result to replace live `running`, `waitingForInput`, or terminal conversation state.

## Tests

- Start with an old repaired snapshot for a continued conversation, return a newer conversation from `loadAgentConversation`, emit the terminal action event, and assert that the newer entries and status are stored.
- Delay the initial background load, insert a newer copy of the same conversation, complete the load, and assert that the existing newer copy wins the merge.
- Keep coverage that initial loading uses repaired conversations without rereading each repaired activity file.
