---
author:
id: F_75
internalId: efff6fd1-ee29-4b18-a397-d49f85ef1bc4
title: Agent confirm gate skipped in one-shot CLI
status: ready
owner:
affects:
agents:
policy:
---

## Problem

Agent prompt says: make plan, implement after confirm, then write `ready` to file. Agent only implements.

## Cause

One-shot is problem.

`claude -p` = single non-interactive turn. No human turn exist. Agent cannot ask "confirm?" then wait — nobody answer. Model see this, skip plan+confirm, jump to implement. Confirm gate need two turns minimum.

## Goal

Let an agent action opt into a live session. User can steer active work, answer questions, and send later turns before explicitly finishing action.

## Action contract

- Add optional `streaming: boolean` to agent actions. Omitted or `false` keeps current one-shot behavior.
- Reject `streaming` on command actions.
- No fallback to one-shot when selected agent lacks streaming support; fail before process start.
- Streaming requires an interactive manual run. Reject scheduled and other unattended starts.
- Keep JSONL transport and current conversation/activity model.

## Provider flows

### Claude

- Run `claude --print --verbose --output-format stream-json --input-format stream-json`.
- Do not put prompt on command line or close stdin.
- Send each user turn as Claude stream-json user message.
- Treat each `result` as turn completion, not process completion.

### Codex

- Run `codex app-server --stdio`; this is JSONL-over-stdio JSON-RPC.
- Initialize connection, start one thread, then start first turn.
- Use `turn/steer` during active turn and `turn/start` after `turn/completed`.
- Map `item/tool/requestUserInput` server requests to UI questions and return response with same JSON-RPC request id.
- Map app-server item, delta, usage, file-change, error, and turn events to existing normalized agent events.

## Execution lifecycle

- Add provider-specific streaming adapters. Keep current one-shot command builder/parser unchanged.
- Add normalized states `running`, `waitingForInput`, and terminal `completed`, `failed`, `cancelled`.
- A completed provider turn moves action to `waitingForInput`; action chain, auto-commit, history finalization, and `on`/`onAfter` wait.
- Add bridge operations to send a message, answer a structured question, and finish streaming execution. Expose them through Electron preload, local dispatch, and remote-control bridge.
- Finish closes provider session gracefully, persists terminal conversation, then resumes normal action completion. Cancel terminates process and action.
- Persist transcript and provider ids at every turn boundary and terminal transition. Use per-turn message ids; never infer waiting state from output text.
- Kill live sessions on project close/app quit. Unexpected process exit before Finish is failure.

## UI

- Add Streaming switch to agent-only action editor.
- While active, show live output and allow steering. While waiting, enable prompt and predefined phrases.
- Render structured questions with their options/free-text input.
- Show Finish and Cancel separately. Closing popup does not stop session; running-action indicator reopens it.

## Tests

- Shared: field default, serialization, command-action rejection, unsupported-profile failure.
- Claude: command, JSONL input, multiple turns, waiting state, questions, finish, cancel.
- Codex: handshake, thread/turn flow, steering, request/response correlation, event mapping, finish, cancel.
- Desktop/app: bridge methods, remote interaction, state transitions, transcript recovery, delayed chain/auto-commit, unattended-run rejection.
- Regression: one-shot Codex and Claude behavior remains unchanged.

## Acceptance

- `streaming: true` works with built-in Codex and Claude profiles.
- User can steer active work, answer agent questions, and continue after each turn without starting a new process.
- No post-action work runs until user finishes session.
- Unsupported or unattended streaming runs fail clearly before spawn.
- Conversations, usage, changed files, cancellation, action history, and running indicators remain correct.
