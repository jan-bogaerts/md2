---
author:
id: J_32
internalId: 1790bf2b-b76c-467a-bdbc-d0f1ba183ebd
title: reuse the runner's resolved executable in the Claude usage poller
status: ready for implementation
owner:
affects:
policy:
agents:
  - design/activity/card__1790bf2b-b76c-467a-bdbc-d0f1ba183ebd.json
after: cc4accfc-c35f-4613-8407-108c00d0a0dd
branch: j_32_reuse_the_runner_s_resolved_executable_in_the_claude_usage_poller
worktree: 2
---

# Problem

`ClaudeUsagePoller` resolves the Claude executable a second time, and resolves the wrong name.

`AgentRunnerService.start()` already resolves the configured agent command through `AgentExecutableResolver` and stores the result on the run. `ClaudeUsagePoller.poll()` then calls the resolver again on every poll, and it looks up the hardcoded literal `'claude'` instead of the command the runner actually launched.

Two consequences follow.

1. **Divergence.** `MD2_AGENT` lets `desktop/src/shell/config.js` replace the default profile's command, so the runner can be launching a different binary or an absolute path while the poller looks up a bare `claude` that need not exist. The poller then polls a different executable than the run it is reporting on, or none at all.
2. **Silent failure.** `find()` returns `null` when lookup fails, and the poller substitutes the literal `'claude'`. A configuration problem therefore surfaces later as a spawn failure and is reported to the UI as *Claude is unavailable*, which points at the wrong cause.

The duplication is only in the call, not in the cache: the runner passes its own resolver instance into the poller, so both share one `Map` and `where.exe` still runs once per environment. The defect is the second lookup of a name nobody chose, not the cost of lookup.

## Current state

`AgentRunnerService.start()` validates the run, then asks `AgentExecutableResolver.find()` to resolve the configured command before it persists the initial checkpoint, requests a usage poll, or spawns the agent. Resolution therefore already happens early enough to supply every start-path consumer.

The result is not treated as required. `resolvedExecutable ?? configuredExecutable` converts a failed lookup into the original command, so the runner still requests usage polling and attempts to spawn an agent whose executable was not found.

When resolution succeeds, the runner stores the resolved `executable` on the run and uses it for the agent spawn. The start-path poll request omits that value even though it is in scope. Tick and close requests pass the stored run, but `requestUsagePoll()` drops `run.executable` in all cases.

`ClaudeUsagePoller` keeps the latest working directory and environment as separate mutable fields. Each poll resolves hardcoded `'claude'`, falls back to the same bare name when lookup fails, and sends that result to both the plain process and pty worker. A request received during an active poll can also replace the fields before the pty fallback, producing a fallback request whose executable, working directory, and environment came from different poll requests.

`requestPoll()` has exactly three sources, and all three already hold a run whose executable the runner resolved:

* `agent_runner_service.js` line 136, at run start, where the resolved `executable` is in scope from line 132;
* `agent_runner_service.js` line 367, on the repeating usage tick, which passes an active run;
* `agent_runner_service.js` line 670, on run close, which passes the closing run.

There is no path on which the poller can run before the runner has resolved an executable, so the poller has nothing left to look up.

This is a correctness and clarity fix. It is **not** the cause of usage failing to report in the current build: with the default profile both call sites resolve the same name through the same shared cache, so the poller receives the correct path today. That investigation is separate.

## Implementation details

Resolve the configured executable once in `AgentRunnerService.start()` and make that result authoritative for both the run and its usage polls.

* In `AgentRunnerService.start()`, throw `Executable not found for ${agent}: ${configuredExecutable}` when `AgentExecutableResolver.find()` returns `null`. Do this before checkpoint persistence, usage polling, and agent spawn. Remove the fallback to `configuredExecutable`. Here, *unavailable agent* means start rejects with this error; it does not mean the usage poller publishes an `unavailable` runtime event.
* Keep `executableResolver` on `AgentRunnerService`; other runner behavior still needs the single resolution. Stop passing it into `ClaudeUsagePoller`.
* Include `executable` in the temporary run-shaped object passed at start. Tick and close already pass a full run containing `run.executable`.
* Extend `requestUsagePoll()` to forward `{ cwd: run.rootPath, env: run.environment, executable: run.executable }`. Keep its `run.agent !== 'claude'` guard unchanged.
* Change `ClaudeUsagePoller.requestPoll()` to require a non-empty `executable`. Throw a clear error when it is missing; do not schedule a poll or guess a command.
* Store each accepted `{ cwd, env, executable }` request as one object. When a pending poll starts, capture that object and use the same snapshot for the plain spawn and any later pty fallback. New requests may replace only the next pending poll.
* Remove `executableResolver`, its constructor guard, the hardcoded `'claude'` lookup, and the bare-name fallback from `ClaudeUsagePoller`.

Removing the lookup also removes an `await` from the start of every poll.

## Affected components

* `desktop/src/actions/agent/claude_usage_poller.js`: accept the executable, drop the resolver dependency, its constructor guard, and the hardcoded name.
* `desktop/src/actions/agent/agent_runner_service.js`: fail a run whose executable cannot be resolved, stop constructing the poller with a resolver, and supply `executable` on each poll request.

## Edge cases

* A poll request without an executable is a programming error. It must throw before changing pending state or spawning a bare name.
* A configured executable that cannot be resolved makes the agent unavailable. The run must fail before checkpoint persistence, polling, or spawn, so no Claude-unavailable usage event can hide the startup cause.
* Repeated requests overwrite the pending working directory, environment, and executable together. An active poll keeps its captured values through the pty fallback.
* Concurrent runs of the same agent continue to share one account-wide poller; the most recent request wins, as it does now.
* The cooldown, the pending-poll scheduling, the pty worker fallback, and the `unavailable` runtime event stay unchanged.

## Testing implications

* Assert that a failed runner resolution rejects start with the executable-not-found error and causes no checkpoint, poll, or spawn.
* Assert that `requestUsagePoll()` forwards the runner's resolved executable at start, on a tick, and on close.
* Assert that the poller uses exactly the executable it was given for the plain spawn and pty fallback, including a path that differs from `claude`.
* Assert that a request without an executable throws without scheduling work.
* Assert that a request arriving during an active poll cannot change that poll's fallback working directory, environment, or executable.
* Assert that `ClaudeUsagePoller` constructs without a resolver.
* Update `agent_runner_state.test.mjs`, which currently asserts `requestPoll` is called with only `{ cwd, env }`.
* Update `claude_usage_poller.test.mjs`, whose fixtures currently supply a fake resolver.

## Acceptance criteria

* `AgentRunnerService` resolves the configured command once before checkpoint persistence, usage polling, and spawn. A failed resolution stops all three with a clear executable-not-found error.
* Every Claude usage request contains the resolved executable used by its run. This includes start, repeating tick, and close requests, including commands overridden through `MD2_AGENT`.
* `ClaudeUsagePoller` contains no executable resolution, resolver dependency, hardcoded `'claude'` command, or executable fallback.
* `ClaudeUsagePoller.requestPoll()` throws when `executable` is missing or empty and schedules no work.
* Plain and pty polling use one captured `{ cwd, env, executable }` request, even when another request arrives during the active poll.
* Cooldown, request coalescing, concurrent-run selection, pty isolation, shutdown, and runtime-event behavior remain unchanged.
* Focused tests, `npm test`, and `npm run lint` pass in `desktop/`.

## See also

* `design/feature_descriptions/F_210_account_limits_use_icon.md`
* `design/architecture/architectural_decisions.md`
