---
author: 
id: F_129
internalId: 88a28fc1-ccbf-4d02-b560-c6726a0394dc
title: unknown agent events
status: design
owner: 
affects:
agents:
  - design/activity/card__88a28fc1-ccbf-4d02-b560-c6726a0394dc.json#conversation=agent-7c47dc44-50d6-4762-a9d2-12d754fd61e2
policy:
after: 
---

currently, it seems that every unknown agent event - line is put in it's own box. this clutters the ui. *consecutive unknown agent events*, should be grouped together in 1 block.

## Current state

`CodexStreamingAdapter` records unsupported item lifecycle notifications as `diagnostic` conversation events. Each has a readable line such as `item/started: futureTool (future-1)` and omits raw provider payloads.

`ActionConversationChat` renders every non-message entry separately. Diagnostics therefore pass through `AgentToolEvent`, producing one bordered box per line, including consecutive notifications for the same unsupported item.

## implementation details

- In conversation rendering, group each maximal run of consecutive `diagnostic` entries. A message or any recognized event ends the run.
- Render each run in one diagnostic block, preserving entry and line order. Keep one diagnostic event as one block too.
- Keep grouping presentation-only. Do not merge, discard, or rewrite persisted conversation entries or change Codex normalization and redaction.
- Keep recognized reasoning, command, tool, and system event rendering unchanged.
- Add chat regression tests for consecutive grouping, boundaries, ordering, and single diagnostics.

## acceptance criteria

- Consecutive unknown-agent diagnostic lines appear in one block.
- Messages and recognized events split diagnostic runs into separate blocks.
- Every diagnostic line remains visible in original order without exposing raw provider payloads.
- Single diagnostics and all recognized event types retain existing content and behavior.
