---
author: 
id: F_91
internalId: 3ffa4da3-1e0f-4930-ad38-6bf247b13c52
title: remove finished reasoning blocks
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__3ffa4da3-1e0f-4930-ad38-6bf247b13c52.json#conversation=agent-ac7729a4-b7cc-4f26-9dad-4b2d311fb765
policy:
after: 
worktree: 2
---

when a reasoning output of an agent finishes, we should remove the block

## Current state

Codex reasoning is stored as an `AgentConversationEvent`. Streaming updates replace the same event by `providerItemId`, changing its status from `inProgress` to `completed`. `ActionConversationChat` currently renders every reasoning event, so completed reasoning blocks remain visible during the live run and in reopened conversations. Failed and declined reasoning already use the error presentation.

## implementation details

- Filter conversation feed activities in `ActionConversationChat`: omit only events where `type === 'reasoning'` and `status === 'completed'`.
- Keep in-progress, failed, declined and unknown-status reasoning visible.
- Keep completed reasoning events in conversation data and persisted history; this is a presentation-only change.
- Update chat tests for live completion, reopened conversations, failed/declined reasoning and unaffected non-reasoning activities.

## acceptance criteria

- In-progress reasoning is visible.
- A reasoning block disappears when its status becomes `completed`, including after reopening a conversation.
- Failed and declined reasoning remains visible with its error state and content.
- Completed non-reasoning activities remain visible.
