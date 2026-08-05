---
author: 
id: F_129
internalId: 88a28fc1-ccbf-4d02-b560-c6726a0394dc
title: unknown agent events
status: to fix
owner: 
affects:
agents:
  - design/activity/card__88a28fc1-ccbf-4d02-b560-c6726a0394dc.json#conversation=agent-7c47dc44-50d6-4762-a9d2-12d754fd61e2
  - design/activity/card__88a28fc1-ccbf-4d02-b560-c6726a0394dc.json#conversation=agent-145987a3-2dc0-4204-baf6-e0559cc33196
policy:
after: 
worktree: 1
---

currently, it seems that every unknown agent event - line is put in it's own box. this clutters the ui. *consecutive unknown agent events*, should be grouped together in 1 block.

## Current state

`CodexStreamingAdapter` records unsupported item lifecycle notifications as `diagnostic` conversation events. Each has a readable line such as `item/started: futureTool (future-1)` and omits raw provider payloads.

`AgentRunnerService` appends every normalized diagnostic as a separate canonical conversation entry because each notification has a unique provider item identity. The shared conversation reader preserves those separate entries when loading persisted files.

`ActionConversationChat` correctly renders canonical entries without merging them. Separate diagnostic entries therefore produce one bordered box per line.

## implementation details

- Keep `CodexStreamingAdapter` normalization and redaction unchanged. It may emit one safe diagnostic per unsupported provider notification.
- When `AgentRunnerService` produces canonical conversation entries, coalesce a diagnostic with the immediately preceding diagnostic entry. Append its readable content after the existing content with a newline.
- Preserve the first diagnostic entry's id, provider item id, sequence, timestamp, label, type, and position. Emit the expanded entry with the same provider item id so live app state replaces it in place.
- A message or any recognized event ends the run because it becomes the conversation tail. The next diagnostic starts a new canonical entry.
- Apply the same consecutive-diagnostic coalescing in the shared conversation reader. This normalizes existing persisted files when read and must be idempotent for files that already contain grouped multiline diagnostics.
- Keep raw persisted files unchanged during reads. Newly persisted conversations contain grouped diagnostic entries produced during the run.
- Keep `ActionConversationChat` and recognized reasoning, command, tool, and system event rendering unchanged. Existing `AgentToolEvent` multiline rendering displays each diagnostic line in order.
- Add runner regression tests for live grouping, stable identity, boundaries, and ordering. Add reader regression tests for existing files, boundaries, and idempotence. Add a chat regression test for rendering one multiline diagnostic block.

## edge cases

- One diagnostic remains one canonical event.
- Consecutive diagnostics for different unsupported items still share one run.
- Messages and recognized events split runs, including recognized events hidden by current chat visibility rules.
- Reading an already grouped multiline diagnostic does not change its content.
- Grouping never reads or exposes raw provider payload fields; only normalized diagnostic content is appended.

## acceptance criteria

- Consecutive unknown-agent diagnostics are one canonical conversation event during live execution and after file loading.
- Messages and recognized events split diagnostic runs into separate canonical events.
- Grouped live updates retain the first entry's identity and position.
- Every diagnostic line remains visible in original order without exposing raw provider payloads.
- Existing persisted files are normalized on read without being rewritten.
- Single diagnostics, chat rendering, and all recognized event types retain existing content and behavior.
