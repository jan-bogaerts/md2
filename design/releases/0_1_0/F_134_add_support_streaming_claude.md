---
author: 
id: F_134
internalId: b9792dd7-f034-4b29-9da5-04fc8cea37c9
title: add support streaming claude
status: ready
owner: 
affects:
agents:
  - design/releases/0_1_0/card__b9792dd7-f034-4b29-9da5-04fc8cea37c9.json#conversation=agent-ed0e1ddd-ff8c-4d8b-8073-ca17195697fa
  - design/releases/0_1_0/card__b9792dd7-f034-4b29-9da5-04fc8cea37c9.json#conversation=agent-85ec9c5a-93f3-4e15-89b7-c363a9e9c18e
policy:
after: 252c6173-b044-4c83-8867-e99254db44d5
---

Currently, we only have full support for streaming agents for the codex agent. we should do the same for the claude agent

## Current state

Claude actions already run as a persistent `stream-json` process with multi-turn messages, session resume, structured questions, file-change tracking, tool transcripts, usage, and terminal-state handling. However, assistant output arrives only as completed messages; thinking and detailed tool lifecycle events are ignored. Every non-question `can_use_tool` request is denied because the approval contract and UI are Codex-specific.

## Implementation details

- Enable Claude partial messages and normalize text, thinking, tool-use, tool-result, and diagnostic events into the existing conversation-entry lifecycle. Use stable provider item ids, preserve provider order, and replace streamed state with authoritative completion without duplicate output.
- Convert non-question Claude `can_use_tool` requests into provider-neutral approvals. Show tool name, input, reason, paths/command, and provider permission suggestions when supplied. Map allow once/session, decline, and stop-turn to exact Claude `control_response` payloads; keep `AskUserQuestion` on the question path.
- Refactor approval types, runner events, bridges, run registry, and popup only as needed to support both Claude and Codex shapes. Preserve concurrent-request, submitted/resolved, reload, and remote-control behavior.
- Keep Claude session resume/fallback, queued messages, usage, changed-path tracking, persistence, and Codex streaming behavior unchanged. Add adapter, runner, bridge, registry, popup, and regression tests in `desktop/` and `app/`.

## Acceptance criteria

- Claude assistant text, thinking, and tool activity update during a turn, remain ordered, and contain no duplicates after completion.
- Claude permission requests show actionable security context; each offered decision sends the matching control response and unblocks or stops the turn.
- Structured questions remain separate from approvals; multiple pending interactions remain isolated and survive renderer reload.
- New and resumed Claude conversations support multiple turns, missing-session fallback, usage, file tracking, queued messages, and terminal states.
- Codex streaming and approval behavior remains unchanged; automated tests cover both providers.
