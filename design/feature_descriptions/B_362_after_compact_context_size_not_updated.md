---
author: 
id: B_362
internalId: ba21cf2c-06f9-4210-aeb5-203d3d6c934d
title: after compact context size not updated
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__ba21cf2c-06f9-4210-aeb5-203d3d6c934d.json
policy:
---

We did a compact on a conversation with the codex agent. this went ok, but after the operation, the context size indictor still indicated the same size.

we should try to update this somehow, or if there is no valid data available after a compact, set it to 0 temporarily

## Current state

The context indicator renders `AgentConversation.contextWindowUsage` from the live run or selected persisted conversation. It updates only when the desktop publishes an `agentUsage` update containing a context-window snapshot.

Codex normally supplies that snapshot through `thread/tokenUsage/updated`. During compaction, the adapter resets its turn snapshot and includes a new value in `turnCompleted` only when the notification arrived first. If Codex omits the notification or sends it after `turnCompleted`, the completion event omits `contextWindowUsage`. The runner therefore retains and persists the pre-compaction value, and the indicator remains unchanged.

Claude explicitly requests context usage before completing the turn and is not affected by this ordering issue.

## Implementation details

* Publish Codex context-window changes independently from turn token accounting so a context-only `thread/tokenUsage/updated` notification can update the conversation even after compaction completion.
* On confirmed Codex compaction, use the fresh context-window snapshot when one is available.
* When confirmed compaction completes without a fresh snapshot, retain the last valid capacity and temporarily set `usedTokens` to `0`. If no valid capacity exists, remove the snapshot instead of fabricating one.
* Persist and publish the context-window change before settling the compact request so the live indicator and stored conversation agree when compaction is reported as completed.
* Allow a later valid Codex context notification to replace the temporary zero.
* Do not reset context usage when compaction is rejected or fails.
* Add focused adapter and runner tests for context usage arriving before completion, after completion, and not arriving, plus failed compaction.

## Acceptance criteria

* A confirmed Codex compaction immediately replaces the pre-compaction context usage with the provider value or a temporary value of `0%`.
* A valid context notification received after compact completion replaces the temporary zero without changing cumulative conversation token accounting.
* Reloading the conversation shows the same post-compaction context usage as the live indicator.
* Failed or rejected compaction preserves the previous context usage.
* Normal Codex turns and Claude compaction retain their existing context and token-usage behavior.
