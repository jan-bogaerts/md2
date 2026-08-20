---
author:
id: J_32
internalId: 1790bf2b-b76c-467a-bdbc-d0f1ba183ebd
title: reuse the runner's resolved executable in the Claude usage poller
status: design
owner:
affects:
policy:
agents:
  - design/activity/card__1790bf2b-b76c-467a-bdbc-d0f1ba183ebd.json
---

# Problem

`ClaudeUsagePoller` resolves the Claude executable a second time, and resolves the wrong name.

`AgentRunnerService.start()` already resolves the configured agent command through `AgentExecutableResolver` and stores the result on the run. `ClaudeUsagePoller.poll()` then calls the resolver again on every poll, and it looks up the hardcoded literal `'claude'` instead of the command the runner actually launched.

Two consequences follow.

1. **Divergence.** `MD2_AGENT` lets `desktop/src/shell/config.js` replace the default profile's command, so the runner can be launching a different binary or an absolute path while the poller looks up a bare `claude` that need not exist. The poller then polls a different executable than the run it is reporting on, or none at all.
2. **Silent failure.** `find()` returns `null` when lookup fails, and the poller substitutes the literal `'claude'`. A configuration problem therefore surfaces later as a spawn failure and is reported to the UI as *Claude is unavailable*, which points at the wrong cause.

The duplication is only in the call, not in the cache: the runner passes its own resolver instance into the poller, so both share one `Map` and `where.exe` still runs once per environment. The defect is the second lookup of a name nobody chose, not the cost of lookup.

## Investigation results

`requestPoll()` has exactly three sources, and all three already hold a run whose executable the runner resolved:

* `agent_runner_service.js` line 136, at run start, where the resolved `executable` is in scope from line 132;
* `agent_runner_service.js` line 367, on the repeating usage tick, which passes an active run;
* `agent_runner_service.js` line 670, on run close, which passes the closing run.

There is no path on which the poller can run before the runner has resolved an executable, so the poller has nothing left to look up.

This is a correctness and clarity fix. It is **not** the cause of usage failing to report in the current build: with the default profile both call sites resolve the same name through the same shared cache, so the poller receives the correct path today. That investigation is separate.

## Proposed change

Pass the resolved executable into the poller and delete the poller's own resolution.

* Extend `requestPoll({ cwd, env, executable })` to accept and store the executable alongside the existing working directory and environment.
* Have `poll()` use the stored executable directly. Remove the `await this.executableResolver.find('claude', ...)` call and the `?? 'claude'` fallback.
* Remove the `executableResolver` dependency and its constructor guard from `ClaudeUsagePoller`. The poller keeps requiring `onRuntimeEvent`.
* Pass `executable` from all three `requestUsagePoll()` call sites: explicitly at run start, and from `run.executable` on the tick and on close.
* Keep the `agent !== 'claude'` guard in `requestUsagePoll()` unchanged.

Removing the lookup also removes an `await` from the start of every poll.

## Affected components

* `desktop/src/actions/agent/claude_usage_poller.js`: accept the executable, drop the resolver dependency, the guard, and the hardcoded name.
* `desktop/src/actions/agent/agent_runner_service.js`: stop constructing the poller with a resolver and supply `executable` on each poll request.

## Edge cases

* A poll request without an executable must not spawn a bare name as a fallback. Nothing schedules one today; the poller should skip rather than guess.
* Repeated requests must keep overwriting working directory, environment, and executable together, so a poll always uses one consistent set.
* Concurrent runs of the same agent continue to share one account-wide poller; the most recent request wins, as it does now.
* The cooldown, the pending-poll scheduling, the pty worker fallback, and the `unavailable` runtime event stay unchanged.

## Testing implications

* Assert that `requestUsagePoll()` forwards the runner's resolved executable, and that the tick and close paths forward `run.executable`.
* Assert that the poller spawns exactly the executable it was given, including a path that differs from `claude`.
* Assert that `ClaudeUsagePoller` constructs without a resolver.
* Update `agent_runner_state.test.mjs`, which currently asserts `requestPoll` is called with only `{ cwd, env }`.
* Update `claude_usage_poller.test.mjs`, whose fixtures currently supply a fake resolver.

## Acceptance criteria

* `ClaudeUsagePoller` contains no executable resolution, no resolver dependency, and no hardcoded `'claude'` string.
* The polled executable always equals the executable the runner launched, including under `MD2_AGENT`.
* A failed executable lookup is reported by the runner rather than being converted into a Claude-unavailable signal by the poller.
* Existing focused tests, `npm test`, `npm run typecheck`, and `npm run lint` pass.

## See also

* `design/feature_descriptions/F_210_account_limits_use_icon.md`
* `design/architecture/architectural_decisions.md`
