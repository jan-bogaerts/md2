---
author: 
id: B_171
internalId: f790586e-149f-4338-8f8e-ad90bcdc1b12
title: claude account usage issues
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__f790586e-149f-4338-8f8e-ad90bcdc1b12.json
policy:
---

We have a polling system that retrieves the claude account usage from the cli. this sort of works.

Here is the problem: it only begins to work after i manually started claude cli and ran `/usage` myself. Then our poller is also able to get the values.

if it can't get a value, it appears to die silently. we need to improve this so that we at least have some console.error or console.warning logs.

Also, i am wondering if it has anything to do with timing. I have the impression that, when running 'claude' and then input '/usage' in the cli, it takes just a fraction of a second, the screen flickers. second time it is faster. perhaps this is our issue?

## Current state

Terminology used below:

- **Plain-stdout attempt**: the first poll attempt, which spawns Claude as an ordinary child process with piped stdio and writes `/usage` plus a newline to its stdin. No terminal emulation is involved.
- **Pty fallback**: the second attempt, which runs Claude under a real pseudo-terminal (node-pty driving a headless xterm screen buffer) inside an Electron utility process, waits for Claude's welcome screen, then types `/usage`.
- **Ready marker**: the text the pty fallback looks for to decide that Claude has finished starting and is accepting input.
- **Inconclusive**: a poll result that says nothing about Claude, so it publishes neither a usage snapshot nor an unavailable state.

### How a poll runs today

`ClaudeUsagePoller.poll` (`desktop/src/actions/agent/claude_usage_poller.js:127`) does the plain-stdout attempt first: it spawns the resolved Claude executable and ends stdin with `/usage` and a newline (`claude_usage_poller.js:45`), collects stdout for at most 20 seconds, then runs `parseClaudeUsageOutput` over what it got.

When that yields nothing, `poll` calls `pollTerminal`, which forks `claude_usage_terminal_worker.js` as an Electron utility process (`claude_usage_terminal_host.js:38`). The worker runs `runTerminalUsagePoll` (`claude_usage_terminal.js:135`), which drives Claude under a pty. `inspectScreen` (`claude_usage_terminal.js:76`) waits until the visible screen contains a ready marker, which today means the literal text `? for shortcuts` or `Try "` (`claude_usage_terminal.js:22`), and only then writes `/usage` and a carriage return. From that point on, every pty data chunk is re-parsed until a complete report is recognised, or until the 20 second deadline at `claude_usage_terminal.js:123` fires.

### Why a failure leaves no trace

`logAgentEvent` is a no-op: `AGENT_LOGGING_ENABLED` is hard-coded to `false` (`desktop/src/actions/agent/agent_file_logger.js:6`, with the guard at `agent_file_logger.js:33`). Both diagnostics the poller emits therefore print nothing:

- `[claude:usage-unparsed]` (`claude_usage_poller.js:142`) is the only record of what the plain-stdout attempt actually produced.
- `[claude:usage-inconclusive]` (`claude_usage_poller.js:154`) is the only record that a poll ended without a verdict.

Every other failure path is an empty `catch` or a silent substitution:

- `claude_usage_poller.js:119` swallows spawn and collection errors and publishes `unavailable` without recording why.
- `claude_usage_poller.js:147`, inside `runPendingPoll`, discards any error that escapes `poll`.
- `claude_usage_terminal_worker.js:13` converts any pty failure into `{ payload: null, unavailable: true }` and drops the error object.
- `claude_usage_terminal_host.js:40`, `:44`, `:47` and `:50` all resolve to `INCONCLUSIVE_RESULT`. Fork failure, abort at shutdown, worker exit without a reply (which is how a native ConPTY fault arrives), and the host-side deadline are therefore indistinguishable from one another downstream.
- A pty timeout with an unparseable screen resolves with `null` rather than rejecting (`claude_usage_terminal.js:123`), so a timeout is also indistinguishable from an aborted poll.

Downstream, an inconclusive result is the worst outcome for the user. `poll` returns without calling `onRuntimeEvent` at all (`claude_usage_poller.js:152`), so `ClaudeRuntimeService.snapshot` stays `null` and no `rateLimits` event is ever dispatched. The account usage display simply never populates, and nothing anywhere explains it.

### Why it starts working after a manual `/usage`

This has not been proven, because the evidence that would prove it is exactly the logging that is disabled. The mechanisms that fit the reported symptom, in order of likelihood:

1. **First-run interactive prompts block the ready marker.** A Claude CLI that has not run in a given folder before shows a trust-this-folder prompt, and a Claude that has never run at all shows onboarding (theme, login). None of those screens contain `? for shortcuts` or `Try "`, so `inspectScreen` never sends `/usage`, the 20 second deadline fires, the screen does not parse, and the poll ends inconclusive and silent. Running `claude` manually once clears the prompt for that folder, after which the poller reaches the welcome screen and works. This matches "only works after i manually started claude cli" exactly.
2. **The startup poll runs in the wrong folder.** `requestStartupUsageRefresh` polls with `cwd = process.cwd()` (`agent_runner_service.js:311`), which for a packaged Electron app is the install or launch directory, not a project folder. Run-triggered polls instead use `run.rootPath` (`agent_runner_service.js:403`). So the startup poll is the one most likely to hit a folder Claude has never been trusted in, and it is also the poll the user is waiting on when the app opens.
3. **The 20 second deadline is too short for a cold Claude start.** The user's observation that the first manual `/usage` is slow and the second is fast is consistent with per-launch cold cost: Node startup, config load, MCP server connections, plus a first `/usage` that fetches from the server before it is cached. That single deadline covers spawn, startup, ready detection and the `/usage` round trip together, and the plain-stdout attempt burns its own 20 seconds before the fallback even starts, so a slow cold start can exhaust the budget.
4. **The plain-stdout attempt is expected to fail, and never says so.** Claude with piped, non-TTY stdin does not run a slash command the way an interactive session does. If that attempt can never succeed, every poll pays up to 20 seconds for it before the fallback starts, and `[claude:usage-unparsed]` being silenced means there is no record of what it returned.

### Retry behaviour makes a single failure permanent

`requestStartupUsageRefresh` guards on `startupRefreshRequested` (`agent_runner_service.js:309`), so the startup refresh happens once per app launch. `lastPollStartedAt` is set at the top of `poll` regardless of outcome, and the cooldown is 120 seconds (`claude_usage_poller.js:6`). After a failed startup poll, nothing schedules another one. The next poll only happens when a Claude run starts (`agent_runner_service.js:403`), or on the 120 second tick while such a run is active (`agent_runner_service.js:429`). A user who opens the app and does not start a Claude run therefore sees no usage at all, indefinitely.

## Implementation details

### Logging

- Failure diagnostics must not depend on `AGENT_LOGGING_ENABLED`. That flag keeps its current role as an opt-in for verbose debug dumps, and the new diagnostics go through `console.warn` and `console.error` directly. Follow the existing convention of a bracketed scope tag plus a single structured object, as at `agent_runner_service.js:277` and `git/git_commands.js:84`.
- Every currently-silent path emits exactly one record, and the records must be distinguishable from each other. At minimum: plain-stdout attempt produced unparseable output; pty fallback never saw a ready marker; pty fallback sent `/usage` but never parsed a report; pty worker failed to fork; pty worker exited without replying; poll aborted at shutdown; spawn or output collection threw.
- Each record carries the attempt (`stdout` or `pty`), the `cwd`, the executable path, the elapsed milliseconds, and the reason. Errors are logged with their message rather than discarded by a bare `catch {}`.
- Do not log Claude's raw output at warn level on every poll. The verbatim dump stays behind `AGENT_LOGGING_ENABLED`; a bounded, truncated excerpt of the last screen belongs in the warn record, and is what makes an unrecognised screen diagnosable.
- One failed poll produces at most a small, bounded number of lines. This code runs on a 120 second tick during long runs, so a chatty failure would flood the console.

### Ready-marker and first-run detection

- `terminalReady` (`claude_usage_terminal.js:22`) must be able to report why it is not ready. Recognise the known blocking screens, meaning trust-this-folder and login/onboarding, and end the poll immediately with that specific reason instead of waiting out the full deadline.
- Do not auto-answer a trust prompt. Trusting a folder is the user's decision, and answering it on their behalf from a background poller is not acceptable. The poll reports the condition and stops. Surfacing that condition in the UI is out of scope for this card.
- Keep the existing markers as the positive ready signal and add to them rather than replacing them. An unrecognised but otherwise fine welcome screen would otherwise regress from "wait a bit longer" into a hard failure.

### Timing

- Separate the two budgets. The plain-stdout attempt and the pty fallback currently share one 20 second constant, because `processTimeoutMs` defaults to `terminalTimeoutMs` (`claude_usage_poller.js:65`), so a slow first attempt eats the fallback's headroom. Give the plain-stdout attempt a short budget and the pty fallback a longer one.
- Inside the pty fallback, split the deadline. Time-to-ready-marker and time-from-`/usage`-to-parsed-report are different waits with different expected durations, and collapsing them into one number hides which of the two expired. The startup poll in particular pays a cold Claude start.
- Confirm from the new logs which phase actually expires before changing any constant. Raising a timeout that was never the problem only trades a fast silent failure for a slow one.

### Retry

- A failed startup poll must retry rather than leaving usage blank until the user happens to start a Claude run. Use a bounded backoff with a small maximum attempt count, not an unbounded loop.
- A failure caused by a blocking first-run prompt is not worth retrying on a short interval, because nothing will change until the user acts. Retrying a timeout is worthwhile; retrying a trust prompt is not.
- Keep the existing 120 second cooldown as the floor for run-triggered polls. Retries must not bypass it in a way that leaves two Claude usage processes running at once.

### Constraints

- The pty stays in the utility process. The reason recorded at `claude_usage_terminal_host.js:12` still holds: a native ConPTY fault cannot be caught in JavaScript, and in the main process it would end the application.
- The stream-error guards and the `stderr.resume()` call in `collectProcessOutput` (`claude_usage_poller.js:26` and `claude_usage_poller.js:34`) must stay. Both prevent either a hang or a main-process crash.
- No new dependency, and no telemetry. Diagnostics stay local console output.
- Existing tests in `claude_usage_poller.test.mjs`, `claude_usage_terminal.test.mjs` and `claude_usage_terminal_host.test.mjs` keep passing, adjusted only where the new reason plumbing changes a signature.

## Acceptance criteria

- No poll outcome is silent. For each failure path (unparseable stdout, no ready marker before the deadline, `/usage` sent but no report parsed before the deadline, worker fork failure, worker exit without a reply, spawn error, host-side deadline), a test asserts that exactly one `console.warn` or `console.error` record is emitted, and that its reason field distinguishes it from every other path.
- A successful poll emits no warning or error output.
- A failing poll emits a bounded number of records. A test asserts that the count does not grow with the volume of Claude output.
- Verbatim Claude output is still gated behind `AGENT_LOGGING_ENABLED`. The always-on records contain at most a truncated excerpt.
- A pty session whose screen shows a trust-this-folder or login/onboarding prompt ends the poll with that specific reason, without sending `/usage`, without answering the prompt, and before the full deadline elapses.
- A pty session that reaches a normal welcome screen still sends `/usage` and still parses the report, unchanged from today.
- The plain-stdout attempt and the pty fallback have independent timeouts, and a test shows that exhausting the plain-stdout budget still leaves the pty fallback its full budget.
- The pty fallback reports which phase expired: waiting for the ready marker, or waiting for the report after `/usage` was sent.
- A startup poll that fails with a retryable reason is retried, with a bounded number of attempts and an increasing delay. A test asserts the attempt count and that retries stop at the bound.
- A startup poll that fails with a non-retryable reason, such as a trust prompt, is not retried on a short interval.
- Retries never run two Claude usage processes at once, and never start a poll less than the cooldown after the previous one started.
- Reproducing the original report by hand, with a Claude CLI that has never been run in the polled folder, produces a console record naming the blocking screen instead of the current silence.
- `npm test` passes in `desktop`.
