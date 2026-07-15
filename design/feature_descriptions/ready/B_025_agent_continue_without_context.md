---
id: B-025
title: continuing an agent conversation starts a context-free new agent
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Superseded by F-050. Truncated transcript replay, free-text session-id patterns, `nativeSessionId`, and linked continuation logs could lose context and could not represent provider switching.

## Resolution

- Persist full ordered MD² messages and provider-session records in one conversation log.
- Parse Codex thread ids and Claude session ids from structured output.
- Resume with explicit ids; send full or cursor-relative normalized history through stdin when required.
- Retry a confirmed missing provider id once as a new session with full history. Never replay unrelated failures.

## Acceptance criteria

- Successful provider turns persist structured ids and synchronization cursors.
- Same-provider follow-up uses explicit native resume; switches receive normalized missing history.
- Missing-id fallback preserves full history and replaces the unavailable id only after success.
- Tests cover id extraction, resume, switches, switch-back, and guarded fallback.

## See also

- `design\architecture\initial description\agents.md`
- `design\feature_descriptions\F_050_one_shot_agent_conversations.md`
