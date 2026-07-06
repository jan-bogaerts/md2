---
id: B-025
title: continuing an agent conversation starts a context-free new agent
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The architecture (agents.md) intends "continue" to resume an existing conversation: a new agent is started that carries the conversation forward, with a single-click way to send "continue". The implementation drops the conversation context entirely: `AgentConversationService.continueConversation` (`app/src/services/agent_conversation_service.ts`) receives the source conversation's `sourcePath` but ignores it and calls `startAgentConversation` with the literal prompt `continue` and title `Continue`. The freshly spawned agent process has never seen the prior conversation, so "continue" is a meaningless instruction to it. The desktop side has no resume mechanism either — `local_git_service.continueAgentConversation` also just pipes the input to a brand-new process (and that whole path is dead code: nothing calls `StorageService.continueAgentConversation`).

## Fix
- Make continuation carry context. Two mechanisms, in order of preference per agent capability:
  1. **Native resume**: if the agent CLI supports resuming a session (e.g. a session/thread id), store that id in the conversation log at run end and pass it on continue.
  2. **Transcript replay**: otherwise, build the continue prompt from the stored conversation log (prior prompt + agent output, truncated to a sane size) followed by the user's instruction ("continue" for the single-click path, or free text).
- Route continuation through `AgentRunnerService` (streaming) like normal starts; the continued run should append to the conversation history chain — link the new log to the source log (`continuedFrom` field) so the UI can show one thread.
- Delete or repurpose the dead `continueAgentConversation` path in `data_types.ts`, `local_git_storage_service.ts`, `preload.js` and `local_git_service.js` so there is exactly one continuation implementation.
- Keep the one-click "continue" button semantics: no input dialog, sends the standard continue instruction with context attached.

## acceptance criteria
- Continuing a completed conversation produces an agent run whose prompt (or session) demonstrably includes the prior conversation content; asking "continue" after "list the tasks in this card" continues that work instead of confusing a fresh agent.
- The continued run streams events and is persisted as a log linked to its source conversation; the UI shows the chain as one conversation thread.
- The single-click continue button still works without any typing.
- The dead `continueAgentConversation` storage/bridge path is removed (or is the single implementation used by the service).
- Tests cover context construction from a stored log, linking of continued runs, native-resume selection when the profile supports it, and the removal of the dead path.

## see also
- `design\architecture\initial description\agents.md`
- `design\feature_descriptions\F_012_agents.md`
- `design\feature_descriptions\F_023_agent_streaming.md`
