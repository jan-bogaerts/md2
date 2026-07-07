---
id: B-028
title: agent conversation log writes can race and corrupt the json file
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`desktop/agent_runner_service.js` persists the conversation JSON with fire-and-forget writes: `handleOutput`, `sendInput` and `handleError` all call `void persistConversation(run.filePath, run.conversation)` on every chunk/event. Multiple `fs.promises.writeFile` calls to the same path can interleave or complete out of order, so:

- a chatty agent can leave a torn/corrupt JSON file (two writes interleaving), which then fails `parseAgentConversationLog` on the next load and shows the card's conversation as a load error;
- a stale intermediate write can land *after* the final `handleClose` write, persisting `status: running` forever for a finished run.

Additionally, run ids are collision-prone: `agent-${Date.now()}-${this.processes.size + 1}` repeats when two runs start in the same millisecond after earlier runs were deleted from the map — colliding ids would share a log file path.

## Fix
- Serialize writes per run: keep a promise chain on the run (`run.writeChain = run.writeChain.then(() => persistConversation(...))`, swallowing per-link errors into an error event). `handleClose` awaits the chain before writing the final state and invoking `onComplete`, guaranteeing the final write is last.
- Throttle intermediate persists (e.g. at most one write per ~250 ms per run); always persist immediately for stdin, error and close events. The in-memory conversation stays the source of truth between writes.
- Make the write atomic: write to `{file}.tmp` then `fs.promises.rename` over the target, so a crash mid-write cannot truncate an existing log.
- Use `crypto.randomUUID()` for run ids (keep the `agent-` prefix if the id shape matters to consumers).

## acceptance criteria
- A run producing many rapid output chunks ends with a valid, parseable JSON log whose final status is `completed`/`failed`, never `running`.
- No partially written/truncated log can be observed by a concurrent reader (atomic replace).
- Two agent runs started in the same millisecond get distinct ids and distinct log files.
- Tests cover write serialization order (final write wins), throttling, atomic replace, and id uniqueness.

## see also
- `design\feature_descriptions\F_023_agent_streaming.md`
- `design\architecture\initial description\agents.md`
