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
Make Electron-owned one-shot agent turns live: stream structured output to React, support cancellation, and persist the conversation log incrementally.

## Current state
Implemented through the Electron action runner. Every agent turn uses a separate structured subprocess with pipes. Parsed output streams through shared execution events, conversation logs persist incrementally, cancellation terminates the active turn, and terminal status reaches the popup, editor panel, card state, and shell indicator.

## implementation details
- Replace the fire-and-forget spawn with a managed agent process registry in the desktop app: each run gets an id, spawn handle, log file path and status.
- Stream parsed provider events and assistant output to the renderer through action execution events.
- Write conversation JSON incrementally: create it as `running`, append ordered events, and finalize as `completed`, `failed`, or `cancelled` with `completedAt`.
- Update `agent_conversation_service.ts` to track running agents from Electron action-runner events so manual, scheduled, `onState`, and continuation runs all appear in the shell indicator.
- The conversation UI shows live output, disables input during a turn, and starts a new process for follow-up input after completion.
- Keep chain orchestration in the Electron action runner. It awaits the agent phase while React observes intermediate events from the same execution id.
- Add cancellation by execution id. Electron terminates the active agent process, finalizes the log as cancelled, and tells the action runner not to start another phase.
- Surface spawn failures, non-zero exits and write errors as user-visible errors; kill orphaned processes on app quit.

## acceptance criteria
- Starting an agent action shows the run as `running` in the shell indicator and in the card/editor conversation UI.
- stdout/stderr appear incrementally in the conversation view while the agent runs.
- Conversation input is disabled while a turn runs. Text submitted after completion starts a one-shot follow-up in the same conversation.
- Persisted conversation status is `running` during execution and `completed`, `failed`, or `cancelled` afterwards, with ordered messages.
- Agent runs started by actions and by `onState` triggers appear in the running-agents indicator.
- Killing/closing the desktop app terminates running agent processes without corrupting log files.
- Tests cover the process registry, structured streaming, incremental log writes, one-shot continuation, provider switching, cancellation and indicator updates.

## see also
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
- `design\feature_descriptions\F_012_agents.md`
- `design\feature_descriptions\F_013_desktop_app.md`
