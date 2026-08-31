---
author: 
id: B_171
internalId: f790586e-149f-4338-8f8e-ad90bcdc1b12
title: claude account usage issues
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__f790586e-149f-4338-8f8e-ad90bcdc1b12.json
policy:
after: 4aff5203-e00a-42bb-9c0c-55d2a77c2e57
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
- **Trust screen**: the prompt Claude shows on its first run in a folder, asking whether the files in that folder are trusted. It appears instead of the welcome screen and blocks all input until answered.
- **Inconclusive**: a poll result that says nothing about Claude, so it publishes neither a usage snapshot nor an unavailable state.

### How a poll runs today

`ClaudeUsagePoller.poll` (`desktop/src/actions/agent/claude_usage_poller.js:127`) does the plain-stdout attempt first: it spawns the resolved Claude executable and ends stdin with `/usage` and a newline (`claude_usage_poller.js:45`), collects stdout for at most 20 seconds, then runs `parseClaudeUsageOutput` over what it got.

When that yields nothing, `poll` calls `pollTerminal`, which forks `claude_usage_terminal_worker.js` as an Electron utility process (`claude_usage_terminal_host.js:38`). The worker runs `runTerminalUsagePoll` (`claude_usage_terminal.js:135`), which drives Claude under a pty. `inspectScreen` (`claude_usage_terminal.js:76`) waits until the visible screen contains a ready marker, which today means the literal text `? for shortcuts` or `Try "` (`claude_usage_terminal.js:22`), and only then writes `/usage` and a carriage return. From that point on, every pty data chunk is re-parsed until a complete report is recognised, or until the 20 second deadline at `claude_usage_terminal.js:123` fires.

### Why a failure leaves no trace

No failure path in the poll writes anything to the console. Every one of them is either an empty `catch` or a silent substitution:

- `claude_usage_poller.js:119` swallows spawn and output-collection errors and publishes `unavailable` without recording why.
- `claude_usage_poller.js:147`, inside `runPendingPoll`, discards any error that escapes `poll`.
- `claude_usage_poller.js:142` and `claude_usage_poller.js:154` are the only two places that mark an unparsed or inconclusive poll, and neither reaches console output.
- `claude_usage_terminal_worker.js:13` converts any pty failure into `{ payload: null, unavailable: true }` and drops the error object.
- `claude_usage_terminal_host.js:40`, `:44`, `:47` and `:50` all resolve to `INCONCLUSIVE_RESULT`. Fork failure, abort at shutdown, worker exit without a reply (which is how a native ConPTY fault arrives), and the host-side deadline are therefore indistinguishable from one another downstream.
- A pty timeout with an unparseable screen resolves with `null` rather than rejecting (`claude_usage_terminal.js:123`), so a timeout is also indistinguishable from an aborted poll.

Downstream, an inconclusive result is the worst outcome for the user. `poll` returns without calling `onRuntimeEvent` at all (`claude_usage_poller.js:152`), so `ClaudeRuntimeService.snapshot` stays `null` and no `rateLimits` event is ever dispatched. The account usage display simply never populates, and nothing anywhere explains it.

### Why it starts working after a manual `/usage`

1. **The trust screen blocks the ready marker.** Claude asks whether the files in a folder are trusted the first time it runs there. That screen contains neither `? for shortcuts` nor `Try "`, so `inspectScreen` never sends `/usage`, the 20 second deadline fires, the screen does not parse, and the poll ends inconclusive and silent. The reporter ran `claude` by hand in a **parent** of the polled folder, not the polled folder itself, so whatever that run cleared did not cover the folder the poller uses. Trust is recorded per folder, and a parent's answer does not necessarily carry to a child.
2. **The startup poll runs in the wrong folder.** `requestStartupUsageRefresh` polls with `cwd = process.cwd()` (`agent_runner_service.js:311`), which for a packaged Electron app is the install or launch directory, not a project folder. Run-triggered polls instead use `run.rootPath` (`agent_runner_service.js:403`). So the startup poll is the one most likely to hit a folder Claude has never been trusted in, and it is also the poll the user is waiting on when the app opens.
3. **The 20 second deadline is too short for a cold Claude start.** The reporter's observation that the first manual `/usage` is slow and the second is fast is consistent with per-launch cold cost: Node startup, config load, MCP server connections, plus a first `/usage` that fetches from the server before it is cached. That single deadline covers spawn, startup, ready detection and the `/usage` round trip together, and the plain-stdout attempt burns its own 20 seconds before the fallback even starts, so a slow cold start can exhaust the budget.
4. **The plain-stdout attempt is expected to fail, and never says so.** Claude with piped, non-TTY stdin does not run a slash command the way an interactive session does. If that attempt can never succeed, every poll pays up to 20 seconds for it before the fallback starts, and there is no record of what it returned.

### Retry behaviour makes a single failure permanent

`requestStartupUsageRefresh` guards on `startupRefreshRequested` (`agent_runner_service.js:309`), so the startup refresh happens once per app launch. `lastPollStartedAt` is set at the top of `poll` regardless of outcome, and the cooldown is 120 seconds (`claude_usage_poller.js:6`). After a failed startup poll, nothing schedules another one. The next poll only happens when a Claude run starts (`agent_runner_service.js:403`), or on the 120 second tick while such a run is active (`agent_runner_service.js:429`). A user who opens the app and does not start a Claude run therefore sees no usage at all, indefinitely.

## Implementation details

### Logging

- Every currently-silent failure path gets real error output, through `console.warn` and `console.error`. Follow the existing convention of a bracketed scope tag plus a single structured object, as at `agent_runner_service.js:277` and `git/git_commands.js:84`.
- The records must be distinguishable from each other. At minimum: plain-stdout attempt produced unparseable output; pty fallback never saw a ready marker; pty fallback answered the trust screen but still never became ready; pty fallback sent `/usage` but never parsed a report; pty worker failed to fork; pty worker exited without replying; poll aborted at shutdown; spawn or output collection threw.
- Each record carries the attempt (`stdout` or `pty`), the `cwd`, the executable path, the elapsed milliseconds, and the reason. Errors are logged with their message rather than discarded by a bare `catch {}`.
- Include a bounded, truncated excerpt of the last screen in the pty records. That excerpt is what makes an unrecognised screen diagnosable, and without it a "never became ready" record cannot be acted on. Do not dump full output on every poll.
- One failed poll produces at most a small, bounded number of lines. This code runs on a repeating interval, so a chatty failure would flood the console.

### Trust screen

- Detect the trust screen in the pty fallback and answer it affirmatively, then keep waiting for the ready marker as usual. The poller does not write to the folder, and if it is the project folder then Claude agents will be run in it shortly anyway, so answering is not a decision that needs to be deferred to the user.
- Detect it by its prompt text on the visible screen, next to the existing ready-marker check in `terminalReady` (`claude_usage_terminal.js:22`). Answer it by sending the keystroke that selects the affirmative option.
- Verify the exact prompt wording and the exact keystroke against the installed Claude CLI during implementation. Do not hard-code either from memory; both are CLI-version dependent, and a wrong keystroke on an unexpected screen is worse than not answering.
- Answer the screen at most once per pty session. If the screen is still present after the answer, that is a distinct failure to log, not a reason to keep sending keys.
- Apply the same handling to a login or onboarding screen if one is detected, except that those cannot be answered: log the specific reason and end the poll rather than waiting out the deadline.
- Keep the existing ready markers as the positive ready signal and add to them rather than replacing them. An unrecognised but otherwise fine welcome screen must keep waiting rather than regressing into a hard failure.

### Poll folder and trigger

- The account usage poll must run in the project folder, not in `process.cwd()`.
- It must therefore start only once a project has been loaded. `activateProject` in `desktop/src/shell/local_bridge_dispatch.js:78` is the point where the main process learns which project is current; it already fans out to `actionSchedulerService.startProject` and `worktreeService.startProject`, and the usage refresh belongs alongside those, with `project.rootPath` as the cwd.
- Launching the window no longer triggers the refresh. `createWindowWithStartupUsageRefresh` (`desktop/src/shell/startup_usage_refresh.js`) and its call site at `desktop/main.js:355` are replaced by the project-activation trigger. Remove the dead path rather than leaving both in place.
- On a project switch, the poll folder follows the new project. A poll already in flight against the previous folder may finish; its result is account-wide, so it stays valid.

### Regular polling

- Poll at a fixed interval regardless of the previous outcome. Success, failure and inconclusive all schedule the next poll the same way. There is no separate retry path and no backoff.
- The interval is the existing 120 second cooldown (`claude_usage_poller.js:6`), which also stays the floor between poll starts. A run-triggered poll and an interval poll must not produce two overlapping Claude processes.
- The interval runs whether or not a Claude run is active, which is the change from today. `syncUsagePollTicks` (`agent_runner_service.js:415`) currently ties the repeating tick to the presence of a pollable run; that condition goes away.
- Stop the interval when no project is active and on shutdown, so a poll is never left running while Electron is exiting.

### Timing

- Separate the two budgets. The plain-stdout attempt and the pty fallback currently share one 20 second constant, because `processTimeoutMs` defaults to `terminalTimeoutMs` (`claude_usage_poller.js:65`), so a slow first attempt eats the fallback's headroom. Give the plain-stdout attempt a short budget and the pty fallback a longer one.
- Inside the pty fallback, split the deadline. Time-to-ready-marker and time-from-`/usage`-to-parsed-report are different waits with different expected durations, and collapsing them into one number hides which of the two expired. The first poll after app start in particular pays a cold Claude start.
- Confirm from the new logs which phase actually expires before changing any constant. Raising a timeout that was never the problem only trades a fast silent failure for a slow one.

### Constraints

- The pty stays in the utility process. The reason recorded at `claude_usage_terminal_host.js:12` still holds: a native ConPTY fault cannot be caught in JavaScript, and in the main process it would end the application.
- The stream-error guards and the `stderr.resume()` call in `collectProcessOutput` (`claude_usage_poller.js:26` and `claude_usage_poller.js:34`) must stay. Both prevent either a hang or a main-process crash.
- No new dependency, and no telemetry. Diagnostics stay local console output.
- Existing tests in `claude_usage_poller.test.mjs`, `claude_usage_terminal.test.mjs`, `claude_usage_terminal_host.test.mjs`, `agent_runner_state.test.mjs` and `startup_usage_refresh.test.mjs` keep passing, adjusted where the trigger move and the new reason plumbing change a signature. `startup_usage_refresh.test.mjs` is removed with the module it covers.

## Acceptance criteria

- No poll outcome is silent. For each failure path (unparseable stdout, no ready marker before the deadline, trust screen still present after being answered, `/usage` sent but no report parsed before the deadline, worker fork failure, worker exit without a reply, spawn error, host-side deadline), a test asserts that exactly one `console.warn` or `console.error` record is emitted, and that its reason field distinguishes it from every other path.
- A successful poll emits no warning or error output.
- A failing poll emits a bounded number of records. A test asserts that the count does not grow with the volume of Claude output.
- Every pty failure record contains a truncated excerpt of the last screen, and the excerpt is bounded in length.
- A pty session whose screen shows the trust screen answers it affirmatively exactly once, then continues waiting for the ready marker, and completes normally when the welcome screen follows.
- A pty session that reaches a normal welcome screen without a trust screen still sends `/usage` and still parses the report, unchanged from today.
- A login or onboarding screen ends the poll with that specific reason, before the full deadline elapses.
- The poll runs with the active project's root path as its cwd. A test asserts the cwd passed to the spawn matches the activated project.
- No usage poll is started before a project has been activated. Creating the window alone triggers no poll.
- Activating a different project moves subsequent polls to the new project's root path.
- Polls repeat on the fixed interval whether the previous one succeeded, failed or was inconclusive, and whether or not a Claude run is active. A test drives three consecutive failures and asserts a fourth poll is still scheduled.
- Two Claude usage processes never run at once, and no poll starts less than the cooldown after the previous one started.
- The interval stops on shutdown and when no project is active.
- The plain-stdout attempt and the pty fallback have independent timeouts, and a test shows that exhausting the plain-stdout budget still leaves the pty fallback its full budget.
- The pty fallback reports which phase expired: waiting for the ready marker, or waiting for the report after `/usage` was sent.
- Reproducing the original report by hand, with a Claude CLI that has never been run in the polled folder, now completes the poll instead of failing silently.
- `npm test` passes in `desktop`.
