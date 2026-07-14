---
id: B-064
title: unified action runner has lifecycle and isolation defects
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

The B-050 migration leaves several execution-lifecycle defects:

- `ActionRunnerService` stores the active project and actions folder on the singleton. An execution snapshots its action graph and context, but later phases read `this.project` and `this.actionsFolder`. Opening another project or switching branch during a run can execute a later phase or append history in the new project.
- `runElectronAction` serializes events through a promise chain but exposes only a resolving result promise. If agent-event recording, conversation linking, or project reload rejects, the returned run promise never settles and the subscription is not cleaned up.
- Manual and `onState` agent events are recorded by both the global `AgentIntegration` subscription and the per-run `runElectronAction` subscription. Scheduled runs use only the global path, so recording and refresh behavior differs by entry point.
- Root `extraPrompt` is passed to every linked agent prompt and command placeholder. Agent, model, and thinking-level overrides are correctly root-only; prompt input must follow the same ownership rule.
- Execution listeners run synchronously without isolation. A throwing UI, IPC, or remote-control listener can change action outcome or prevent terminal cleanup.
- Electron emits and stores a terminal result before awaiting the scheduler's `actionCompleted` callback. If that callback rejects, renderer consumers already saw success while `wait()` rejects, and renderer-started executions can produce an unobserved rejection.
- Failure status is derived from the failed action's immediate phase. If an action in the root `onBefore` subtree fails inside its own `onAfter`, the phase becomes `after` and the root is incorrectly reported as `okButNotAfter` even though the root action never started.
- Cancelling an active phase emits only the root execution's terminal `cancelled` event. The current action has a `running` event with no matching action-specific terminal event, leaving phase/action consumers with stale state.
- Command execution uses buffered `exec`; stdout and stderr are published only after exit. The B-050 requirement to keep streaming behavior consistent across entry points is therefore not implemented.
- Scheduled execution receives the shared runner result, but maps failures to history and then marks every fired schedule `done`. A running schedule also retains no execution id through which schedule cancellation can reach the shared runner. Scheduled failure and cancellation behavior therefore remains different from manual and `onState` runs.
- Tests do not prove B-050 entry-point parity. The `onState` test mocks `runElectronAction`, schedule tests exercise the Electron runner separately, cancellation covers only root command/agent phases, and no test covers multiple matching `on` rules or cancellation in `before`, `on`, and `after` phases.

## Fix

- Snapshot project and actions-folder references in each execution and use that snapshot for every phase and history write. Project changes must not retarget an active execution.
- Give the renderer result promise a rejection path. On any event-processing failure, unsubscribe and reject with the original error.
- Assign agent-event recording and conversation linking to one shared consumer. Per-run UI collection must not repeat persistence or global state updates.
- Apply `extraPrompt` only to the requested root action. Linked actions use persisted prompt/command data and their own definition/default settings.
- Isolate listener failures from execution. Report delivery failures through the existing error/telemetry path without changing process or chain status.
- Finalize action execution independently from schedule-trigger bookkeeping. A scheduler callback failure must be recorded as a scheduler failure and must not contradict the already published action result.
- Track root-relative failure semantics through recursive chains so only failure in the root action's `onAfter` subtree produces `okButNotAfter`.
- Emit one terminal action event for the active action on cancellation before emitting the terminal root execution event.
- Stream command stdout and stderr through action events while the process is running.
- Preserve the shared execution id on a running schedule, map runner results to distinct schedule terminal states, and delegate running cancellation to `ActionRunnerService.cancel`.
- Add integration coverage in which manual, `onState`, and scheduled entry points reach the same runner and assert identical ordering and results.

## Edge cases

- Project or branch changes while an action is running or between linked phases.
- Remote-control connection closes while an execution event is published.
- Conversation linking or project snapshot reload fails on the terminal event.
- Root action has `extraPrompt` and linked actions contain `{{prompt}}` or accept appended prompt text.
- Multiple listeners are registered and one throws.
- An `afterAction` schedule load/save fails after the triggering action succeeds.
- A nested `onAfter` fails while its parent action is executing in root `onBefore` or `on`.
- Cancellation occurs while a linked `before`, `on`, or `after` action is active.
- Multiple `on` rules match and a later matching action fails or is cancelled.
- A scheduled action fails, returns `okButNotAfter`, or is cancelled while running.

## Compatibility and side effects

- Execution request and bridge shapes stay unchanged.
- Persisted action and history schemas stay unchanged.
- Existing executions remain keyed by one Electron execution id.
- Schedule-trigger errors remain visible, but no longer rewrite or reject the triggering action result.

## acceptance criteria

- Every execution uses the project and actions folder captured at start for all phases and history writes.
- Renderer run promises always resolve or reject and always unsubscribe on terminal processing or processing failure.
- Each agent event is recorded once for manual, `onState`, and scheduled runs.
- Run-specific prompt input affects only the requested root action.
- A throwing execution listener cannot change action status or prevent cleanup.
- Scheduler callback failure cannot produce a completed event and a rejected result for the same execution.
- Nested failures produce root-relative `failed` or `okButNotAfter` results according to B-050.
- Cancellation emits terminal state for both the active action and root execution and starts no later phase.
- Command output is published while the command is running.
- Scheduled runs preserve shared runner failure/cancellation results and expose running cancellation through the same execution id.
- Tests cover project switching, event-processing rejection, duplicate recording, linked prompt isolation, listener failure, scheduler callback failure, every chain phase, multiple matching `on` rules, and real manual/`onState`/scheduled delegation.

## Existing reports excluded from this card

- [[B-009]] owns global indicator, event context, card state, and terminal UI cleanup.
- [[B-049]] and [[B-055]] own agent/model/thinking-level validation and root-versus-linked selection rules.
- [[B-051]] owns worktree validation, repository locking, and related cancellation coverage.
- [[B-058]] owns rejection of unknown action fields.

## see also

- [[B-009]]
- [[B-050]]
- [[F-022]]
- `design\architecture\initial description\writings\running_actions.md`
