---
id: F-023
title: agent process streaming
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Make Electron-owned agent action execution live: stream stdout/stderr to React, distinguish live stdin from continuation input, support cancellation, and persist the conversation log incrementally.

## Current state
Agent runs are batch: `runProcessWithInput` in `desktop/local_git_service.js` buffers stdout/stderr and resolves only when the process exits. `runAgent` and `continueAgentConversation` return a single final result; the conversation JSON is written once, after completion, so its status is never `running`. There is no stdin forwarding beyond the initial prompt, no output streaming channel to the renderer, and no way to see or stop a long-running agent. The shell running-agents indicator only reflects the synchronous `continueConversation` wrapper in `app/src/services/agent_conversation_service.ts`.

## implementation details
- Replace the fire-and-forget spawn with a managed agent process registry in the desktop app: each run gets an id, spawn handle, log file path and status.
- Stream stdout/stderr chunks to the renderer through preload callbacks (e.g. `onAgentOutput(runId, chunk, channel)`), and expose `sendAgentInput(runId, text)` to forward stdin.
- Write conversation JSON incrementally: create it as `running`, append ordered events, and finalize as `completed`, `failed`, or `cancelled` with `completedAt`.
- Update `agent_conversation_service.ts` to track running agents from Electron action-runner events so manual, scheduled, `onState`, and continuation runs all appear in the shell indicator.
- The conversation UI (card popover and editor bottom panel) shows live output for running conversations and offers the one-click `continue` when finished.
- Keep chain orchestration in the Electron action runner. It awaits the agent phase while React observes intermediate events from the same execution id.
- Add cancellation by execution id. Electron terminates the active agent process, finalizes the log as cancelled, and tells the action runner not to start another phase.
- Surface spawn failures, non-zero exits and write errors as user-visible errors; kill orphaned processes on app quit.

## acceptance criteria
- Starting an agent action shows the run as `running` in the shell indicator and in the card/editor conversation UI.
- stdout/stderr appear incrementally in the conversation view while the agent runs.
- Text entered while the conversation is running is forwarded to that agent's stdin. Text submitted after completion starts or resumes a linked run instead.
- Persisted conversation status is `running` during execution and `completed`, `failed`, or `cancelled` afterwards, with ordered messages.
- Agent runs started by actions and by `onState` triggers appear in the running-agents indicator.
- Killing/closing the desktop app terminates running agent processes without corrupting log files.
- Tests cover the process registry, incremental log writes, action-runner events, live stdin, post-completion continuation, cancellation and indicator updates.

## see also
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
- `design\feature_descriptions\F_012_agents.md`
- `design\feature_descriptions\F_013_desktop_app.md`
