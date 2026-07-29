---
author:
id: F_79
internalId: a299e58b-f40d-4938-ba56-9850e44d739c
title: Streaming restart loses conversation context
status: ready
owner:
affects:
agents:
policy:
---

## Problem

Continuing an existing MD² conversation with a streaming action can lose earlier context after its provider process has stopped.

MD² stores a provider session with a `conversationId` and `synchronizedThroughMessageId`. The cursor means that the provider session already contains the transcript through that message. MD² therefore sends only later transcript entries when continuing that session.

The streaming path applies this cursor but does not resume the corresponding provider session:

- Codex always starts a new thread.
- Claude always starts a new process without resuming the saved session.

The new provider session receives only the post-cursor transcript and current prompt. Earlier conversation context is missing. Same-process streaming turns are unaffected.

One-shot continuation already uses the saved provider conversation ID and retries with the full transcript when the provider reports that the session is unavailable.

## Expected behavior

Use the same continuation rules for streaming and one-shot turns:

1. When the matching streaming provider process is still active, send the message to that process.
2. When no process is active and the selected agent has a provider session, resume it using its saved provider conversation ID.
3. After successful resume, send only transcript entries after that provider session's synchronization cursor.
4. If resume reports that the session is unavailable before a turn starts, start a fresh provider session and send the full normalized MD² transcript plus the current message.
5. When the selected agent has no provider session, start a fresh session with the full transcript.

Switching back to an agent with an older provider session must resume that session and send all transcript entries added since its cursor.

## Constraints

- The persisted MD² transcript remains complete. Cursor use must never delete or truncate stored messages.
- Provider conversation IDs are provider-specific and must not be shared between agents.
- Retry only after a confirmed missing-session result before a turn starts. Do not replay after failures that may have caused side effects.
- Advance the provider cursor only after a successful turn.
- Keep one-shot continuation behavior unchanged.

## Main implementation areas

- `desktop/src/actions/action_agent_executor.js`: select live send, provider resume, fresh-session, and missing-session fallback paths.
- `desktop/src/actions/agent_streaming_adapter.js`: resume saved Codex threads and Claude sessions instead of always creating new ones.
- `desktop/src/actions/agent_runner_service.js`: preserve exactly-once message persistence and retry semantics across streaming restart.

## Tests

- Restarted Codex streaming conversation resumes its saved thread and keeps earlier context.
- Restarted Claude streaming conversation resumes its saved session and keeps earlier context.
- Active streaming process receives the message directly without restart.
- Confirmed missing streaming session retries once with the full transcript.
- Different agent without a session receives the full transcript.
- Switching back resumes that agent's prior session and sends only post-cursor entries.
- Failed or cancelled turns do not advance the cursor or trigger unsafe replay.
- Existing one-shot continuation tests remain unchanged and pass.

## Acceptance criteria

- Restarting a streaming conversation never loses synchronized context.
- Streaming and one-shot continuation use the same provider-session and transcript-fallback rules.
- Same-process streaming remains direct.
- Stored MD² transcripts remain complete and provider-independent.
