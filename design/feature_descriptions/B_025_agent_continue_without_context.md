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
**Mostly fixed — one gap left (2026-07-06 audit).** Transcript replay is implemented: `AgentConversationService.continueConversation` loads the source log, builds `buildContinuePrompt` (truncated transcript + instruction), routes through the streaming `startAgentConversation` path and links the new log via `continuedFrom`. The native-resume path is scaffolded (`nativeSessionId` on the log, `resumeCommand`/`{{sessionId}}` on profiles, `buildResumeAgentCommand` in `local_bridge_dispatch.js`) but **unreachable in practice**: nothing ever *captures* a session id from a fresh agent run — `desktop/agent_runner_service.js` only copies `nativeResumeSessionId` from an incoming resume request, and no built-in profile defines `resumeCommand`. A conversation can therefore never acquire a first `nativeSessionId`, so continuation always falls back to transcript replay.

## Remaining fix
- Capture the session id at run end: let a profile define a `sessionIdPattern` (regex with one capture group) applied to the run's combined output in `agent_runner_service.handleClose`; store the match as `nativeSessionId` in the persisted log. (Codex and Claude CLIs print/expose session ids; patterns live in the profile so new agents need no code change.)
- Ship `resumeCommand` (and `sessionIdPattern`) on the built-in codex/claude profiles where their CLIs support resume (`codex resume {{sessionId}}` / `claude --resume {{sessionId}}` or the then-current flags).
- Keep transcript replay as the fallback when no session id was captured or the profile has no `resumeCommand` (current behavior).

## acceptance criteria
- A fresh run with a profile that defines `sessionIdPattern` persists a `nativeSessionId` in its log when the agent output contains one.
- Continuing such a conversation resolves the profile's `resumeCommand` with that session id instead of replaying the transcript.
- Continuing a conversation without a captured session id (or with a profile lacking `resumeCommand`) still uses transcript replay, unchanged.
- A profile with `resumeCommand` but no captured id does not error — fallback applies.
- Tests cover session-id capture from output, resume-command selection, and the fallback paths.

## see also
- `design\architecture\initial description\agents.md`
- `design\feature_descriptions\F_012_agents.md`
- `design\feature_descriptions\F_023_agent_streaming.md`
