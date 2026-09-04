---
author:
id: J_46
internalId: cd8c317c-a566-4ec1-bc4b-e598c892ea89
title: detect Claude ready prompt
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__cd8c317c-a566-4ec1-bc4b-e598c892ea89.json
policy:
changedFiles:
  - desktop/src/actions/agent/claude_usage_terminal.js
  - desktop/src/actions/agent/claude_usage_terminal.test.mjs
after: 6e041d8b-7aca-4ab1-9be5-56d7e31d189c
branch: j_46_detect_claude_ready_prompt
worktree: 2
---

Make Claude account-usage polling detect when the interactive terminal is accepting input without depending only on welcome-screen copy.

## Current state

`runTerminalUsagePoll()` starts Claude in a PTY and waits before sending `/usage`. `terminalReady()` currently recognizes only the visible phrases `? for shortcuts` and `Try "`. Claude Code 2.1.241 can settle on an empty `> ` input prompt without either phrase. Whether the poll catches an earlier redraw containing one of those phrases then becomes timing-dependent: one poll may time out without sending `/usage`, while a later poll succeeds.

Login, onboarding, and workspace-trust screens are detected separately. The trust screen may be answered once; login and onboarding end the poll. After `/usage` is sent, the existing rendered-screen parser correctly reads the current session and weekly usage windows.

## Implementation details

* Detect readiness from the active xterm cursor line in addition to the existing phrase checks.
* Treat Claude as ready when the cursor is on an otherwise empty input line whose trimmed form is `>`. Read that line from `terminal.buffer.active` using `baseY + cursorY`.
* Evaluate login, onboarding, and trust screens before prompt readiness. Never interpret their selection cursors or text as the Claude input prompt.
* Keep the existing phrase checks as secondary readiness signals for Claude versions whose prompt is not yet visible when their welcome hint appears.
* Send `/usage` only once. Preserve the existing ready and report deadlines, worker isolation, abort handling, diagnostics, usage parsing, and runtime event behavior.
* Do not introduce a fixed startup delay. Readiness must follow observable terminal state rather than elapsed time.

## Edge cases and failure modes

* A trust-screen selection cursor on option 1 is not an empty `>` input prompt.
* Welcome text may contain `>` elsewhere; only the active cursor line qualifies.
* A prompt containing typed text does not qualify. The poll owns a fresh Claude process and expects an empty prompt before sending its command.
* If neither a supported prompt nor a legacy marker appears, the existing ready timeout and `pty-no-ready-marker` diagnostic remain authoritative.
* Repeated screen redraws must not send `/usage` more than once.

## Tests

Update `claude_usage_terminal.test.mjs` to cover:

* a Claude Code 2.1.241-style welcome screen with no legacy readiness phrase, an empty active prompt, and `/usage` being sent;
* login, onboarding, and trust screens taking precedence over prompt detection;
* welcome text containing `>` away from the cursor line not being accepted;
* repeated prompt redraws sending `/usage` once;
* preservation of the existing legacy-marker, timeout, abort, and parsed-report behavior.

Run `npm run test -- src/actions/agent/claude_usage_terminal.test.mjs`, then `npm run lint` from `desktop`.

## Acceptance criteria

1. Claude Code 2.1.241 reaches `/usage` when its settled screen exposes an empty active input prompt but no legacy readiness phrase.
2. Login, onboarding, and trust handling remains unchanged and occurs before prompt readiness.
3. `/usage` is sent at most once per terminal poll.
4. Unsupported or incomplete screens still terminate through the existing bounded timeout and diagnostics.
5. Usage report parsing and published rate-limit payloads remain unchanged.
6. Focused terminal polling tests and desktop lint pass.

## Out of scope

Changing the `/usage` report parser, polling interval, worker-process architecture, runtime snapshot model, account-usage persistence, or UI presentation.
