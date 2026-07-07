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
Make agent execution live: stream stdout/stderr from the Electron-run agent process to React while it runs, forward stdin input from the UI, and persist the conversation log incrementally so a `running` status is actually observable (per F-012/F-013 and `agents.md`).

## Current state
Agent runs are batch: `runProcessWithInput` in `desktop/local_git_service.js` buffers stdout/stderr and resolves only when the process exits. `runAgent` and `continueAgentConversation` return a single final result; the conversation JSON is written once, after completion, so its status is never `running`. There is no stdin forwarding beyond the initial prompt, no output streaming channel to the renderer, and no way to see or stop a long-running agent. The shell running-agents indicator only reflects the synchronous `continueConversation` wrapper in `app/src/services/agent_conversation_service.ts`.

## implementation details
- Replace the fire-and-forget spawn with a managed agent process registry in the desktop app: each run gets an id, spawn handle, log file path and status.
- Stream stdout/stderr chunks to the renderer through preload callbacks (e.g. `onAgentOutput(runId, chunk, channel)`), and expose `sendAgentInput(runId, text)` to forward stdin.
- Write the conversation JSON incrementally: create it with status `running` when the process starts, append messages as chunks arrive (throttled), and finalize with `completed`/`failed` and `completedAt` on exit.
- Update `agent_conversation_service.ts` to track running agents from bridge events (start/output/exit) instead of only wrapping `continueConversation`, so `ActionRunner` agent runs and `onState` triggered runs also appear in the shell indicator.
- The conversation UI (card popover and editor bottom panel) shows live output for running conversations and offers the one-click `continue` when finished.
- Keep the existing synchronous return shape for `ActionRunner` chaining: the runner awaits process exit, but the UI can observe intermediate output via the registry.
- Surface spawn failures, non-zero exits and write errors as user-visible errors; kill orphaned processes on app quit.

## acceptance criteria
- Starting an agent action shows the run as `running` in the shell indicator and in the card/editor conversation UI.
- stdout/stderr appear incrementally in the conversation view while the agent runs.
- Text entered in the conversation UI is forwarded to the agent's stdin.
- The persisted conversation JSON has status `running` during execution and `completed`/`failed` afterwards, with ordered messages.
- Agent runs started by actions and by `onState` triggers appear in the running-agents indicator.
- Killing/closing the desktop app terminates running agent processes without corrupting log files.
- Tests cover the process registry, incremental log writes, streaming callbacks, stdin forwarding and indicator updates.

## see also
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
- `design\feature_descriptions\F_012_agents.md`
- `design\feature_descriptions\F_013_desktop_app.md`
