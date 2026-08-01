---
author: 
id: B_85
internalId: 56dd54b0-9554-4545-85d4-bb45efef4d6e
title: add the reference to a chatlog to a card as soon as possible
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__56dd54b0-9554-4545-85d4-bb45efef4d6e.json#conversation=agent-f03c3094-abbc-4fc5-a061-a5f004b7aa4a
policy:
after: 5cdae748-9597-4d29-8dc0-3d4b5df3aa7f
worktree: 2
---

do not wait until the end of the conversation to update the card so that it has the reference to the chatlog of the agent-action, but add it as soon as the chatlog file is first created.

this file should be created upon first log entry and updated frequently, not just at end of conversation

## Current state

Agent chatlogs are canonical conversations embedded in `design/activity/card__<internalId>.json`. `AgentRunnerService` builds the conversation and reference at startup, but persists only selected waiting/input checkpoints and the terminal snapshot. One-shot runs therefore create the file only when they end.

`AgentIntegration` adds the reference from the terminal `action` event. It ignores the earlier `agentStarted` update, although that update already contains the conversation reference.

## implementation details

- Persist the initial conversation, containing its user and `started` entries, before publishing `agentStarted`. Publish no reference when this first write fails.
- After every conversation-entry append or update, queue a full conversation checkpoint. This includes each streaming delta, provider event, message, diagnostic, error, and closing entry; do not throttle or merge writes.
- Keep writes ordered through the existing run and activity-file queues. Checkpoints remain uncommitted; terminal persistence waits for them and commits the final snapshot.
- On card-scoped `agentStarted`, add `conversation.path` to the card's `agents` header. Keep terminal linking as fallback, but make linking and loading idempotent for continuations and terminal events.
- Add regression tests for initial persistence ordering, every entry mutation, write serialization/failure, early card linking, and duplicate prevention.

## acceptance criteria

- First activity file exists with initial user and `started` entries before its reference is added to the card.
- Active card contains conversation reference while agent is still running; reloading project can load current partial conversation.
- Every appended or updated conversation entry produces one ordered checkpoint containing that change, including every streaming delta.
- Completion waits for pending checkpoints, writes final status and `closed` entry, and commits final activity file.
- Continuation and terminal events never add duplicate references or load same conversation twice.
- Failed initial persistence leaves no dangling card reference and fails action through existing error handling.
