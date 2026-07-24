---
id: J-016
title: split ActionRunnerService into execution and executor collaborators
status: ready
owner: JB
affects:
  - desktop/src/actions/action_runner_service.js
  - desktop/src/actions/action_runner_service.test.mjs
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Split the 565-line Electron `ActionRunnerService` into focused modules while preserving its public API, execution semantics, bridge contracts, persisted data, and event shapes. This is a structural refactor only: **no behavior change**.

The service became the single Electron action runner through [[J-008]], [[J-013]], [[B-050]], and [[B-064]]. That consolidation is correct, but its implementation now combines service lifecycle, per-execution state, chain interpretation, command spawning, agent continuation, history construction, event delivery, and request validation in one file. The matching test file is over 700 lines and has the same mixed ownership.

This report describes the current working-tree implementation as inspected on 2026-07-15. Continuation handling is actively evolving around provider sessions and transcript synchronization; the refactor must preserve that current behavior rather than reintroduce the older `nativeSessionId`/synthetic-prompt path.

## Current architecture and call graph

### Production construction

`desktop/main.js` creates one global `ActionRunnerService` with:

- `actionWorktreeExecutionService`;
- `agentConfigProvider`;
- `agentRunnerService`;
- `errorReporter`;
- `localGitService`.

`commandRunner` is an optional test seam. The production default command runner uses `spawn`.

### Verified external call sites

| Caller | Methods used | Required behavior after split |
| --- | --- | --- |
| `desktop/main.js` | constructor, `stop` | Keep the existing construction and lifecycle contract. Do not add a second global runner. |
| `desktop/src/actions/action_scheduler_service.js` | `startProject`, `start`, `wait`, `cancel` | Keep scheduled actions on the same runner and preserve the shared execution id. |
| `desktop/src/shell/local_bridge_dispatch.js` | `start`, `cancel`, `subscribe`, `requireActionsFolder` | Keep bridge method names, request/result shapes, synchronous subscription behavior, and history-folder lookup unchanged. |
| Runner tests | constructor dependency overrides, exported `validateStartRequest` | Keep these seams available or move tests to the owning module without adding compatibility shims. |
| Scheduler tests | real and mocked runner instances | Preserve public runner behavior; do not expose new phase-level APIs to the scheduler. |

No production caller directly invokes `execute`, `runAction`, `runMain`, `runCommandAction`, `runAgentAction`, `runAgentTurn`, `runAgentProcess`, history helpers, or `emit`. They are internal implementation seams and can move.

### Existing collaborators that remain authoritative

- `action_definition_resolver.js` owns loading, validating, sanitizing, and resolving an action definition by id. Do not duplicate this logic in a new repository class.
- `action_worktree_execution_service.js` owns worktree selection, repository locking, and execution metadata. Every linked action must continue to pass through it independently.
- `agent_runner_service.js` owns the provider process/protocol lifecycle. The action runner adapts it; it must not copy provider parsing or process management.
- `agent_transcript.js` owns normalized continuation context.
- `agent_profiles.mjs` owns runtime agent/model/thinking-level resolution and resume-command construction.
- `shared/action_history.mjs` owns commit-summary parsing.
- `local_git_service` remains the persistence boundary for action definitions, conversations, and run history.

## Current responsibilities and why the split is needed

### 1. Service lifecycle and execution registry

`ActionRunnerService` owns the current project/actions-folder lifecycle, listener set, active execution map, completed-result map, execution-id generation, and start/wait/cancel behavior. This is the correct responsibility for the public facade.

### 2. Per-execution mutable state

Each start snapshots `project`, `actionsFolder`, `context`, `rootAction`, and `runInput`, then adds an `AbortController`, active agent run id, execution id, and completion promise. The service passes this record through nearly every internal method. That parameter threading is the clearest extraction boundary: the record should become an `ActionExecution` instance.

### 3. Chain interpretation

`runAction` recursively executes:

1. all `onBefore` actions in order;
2. the current action;
3. every matching `on` rule in declaration order;
4. all `onAfter` actions in order.

It also carries the root-relative phase needed to distinguish ordinary failure from `okButNotAfter`. This is execution behavior, not global service lifecycle.

### 4. Action terminal state and events

`runMain` starts the action, selects the command or agent path, emits streamed and terminal events, maps nonzero exit codes to failure, emits an action-specific cancellation before the root terminal event, and attaches root-phase metadata to failures. This is currently the most policy-dense method.

### 5. Command execution

The module validates the Git root, starts a shell process, buffers stdout/stderr while streaming chunks, maps cancellation, resolves placeholders, enters the worktree lock, and appends history. The actual command path is small and does not justify a service class with no state.

### 6. Agent execution and continuation

The agent path currently owns all of the following:

- root-only runtime overrides for agent, model, and thinking level;
- root-only `extraPrompt` and `continueFrom`;
- action-default fallback for linked actions;
- worktree execution;
- source-conversation loading;
- removal of the `worktree:<index>:` prefix before conversation lookup;
- source conversation/card ownership validation;
- provider-session selection by resolved agent;
- incremental transcript context after `synchronizedThroughMessageId`;
- native resume command construction;
- switching providers with full normalized transcript context;
- one fallback when a provider session is confirmed missing before a turn starts;
- callback-to-promise adaptation around `AgentRunnerService.start`;
- active agent run-id tracking for cancellation;
- result normalization and agent history construction.

This is the largest cohesive internal subsystem and needs its own executor.

### 7. History construction

Command and agent actions both combine output, compute completion time/status, optionally derive commit metadata, derive the repository root/branch used by the execution, and call `appendActionRunHistory`. The entry shapes differ, but persistence mechanics and commit metadata are shared.

### 8. Validation and prompt text

Request/context/run-input validation and placeholder/prompt resolution are pure functions. They do not depend on service state and obscure the class lifecycle at the top of the current file.

## Target ownership

Use the following boundaries unless implementation inspection reveals a concrete incompatibility. Do not create forwarding classes or compatibility files.

### `action_runner_service.js`: public facade

Keep `ActionRunnerService` as the only externally constructed action runner. It owns:

- project/actions-folder lifecycle;
- root definition loading through `resolveActionDefinition`;
- execution-id generation;
- active and completed execution registries;
- `start`, `wait`, `cancel`, `subscribe`, `stop`, and `requireActionsFolder`;
- listener isolation and error reporting;
- composition of the internal collaborators.

The facade creates one `ActionExecution` per successful `start`. It must not retain chain traversal, action-type execution, process callback adaptation, prompt resolution, or history-entry construction.

Keep the constructor dependency shape accepted by existing production and test call sites. Compose the new collaborators internally from those dependencies. Do not add legacy aliases or a second constructor mode.

### `action_execution.js`: one stateful execution

Add one `ActionExecution` class in its own file. It owns:

- the immutable start snapshot (`project`, `actionsFolder`, `context`, `rootAction`, `runInput`, `executionId`);
- its `AbortController` and active agent run id;
- `run`, `cancel`, recursive chain traversal, root-phase propagation, action status mapping, and action event construction;
- selection of the command or agent executor;
- coordination with `ActionWorktreeExecutionService` for every individual action;
- calling the history recorder after an action process returns and before the action is considered complete.

The service registry stores `ActionExecution` instances rather than anonymous mutable records. `cancel()` belongs on the execution; the facade only resolves the id and delegates.

Event delivery should be injected as a single publisher callback. `ActionExecution` constructs complete domain events because it owns action, phase, root action, context, execution id, and status. `ActionRunnerService` publishes them to listeners and isolates listener errors.

### `action_agent_executor.js`: agent-specific executor

Add one `ActionAgentExecutor` class in its own file. A class is justified because it owns several related operations and injected dependencies (`agentConfigProvider`, `agentRunnerService`, `localGitService`). It owns:

- resolved agent configuration;
- source-conversation and provider-session resolution;
- prompt/context/request construction;
- resume and missing-session fallback;
- callback-to-promise adaptation;
- normalized process result fields needed by events and history.

It accepts explicit callbacks for streamed agent events and active-run changes, or an equivalent narrow execution-control interface. It must not receive the entire `ActionRunnerService` or mutate service maps.

The fallback condition must remain exact: retry only when a provider conversation id was requested, the result confirms `missingSession`, and no turn started. The retry uses the producing run's conversation/reference, removes `providerConversationId`, supplies full normalized history when present, and sets `reuseLastUserMessage: true`. Do not retry unrelated startup, process, protocol, or post-turn failures.

### `action_command_executor.js`: command-specific functions

Use plain exported functions, not a service class. Own:

- the default spawned command runner;
- Git-root assertion;
- stdout/stderr buffering and streamed chunk callbacks;
- abort-to-`ActionCancellationError` mapping;
- command placeholder resolution at execution time.

Continue to allow the injected `commandRunner` seam so tests do not spawn real processes.

### `action_run_request.js`: pure boundary validation

Move `validateStartRequest` and its private validation helpers here. Continue exporting `validateStartRequest` from `action_runner_service.js` only if a verified external production import requires it; otherwise update the runner test to import the owning module directly. The current verified import is test-only, so no compatibility re-export is required.

Preserve strict allowlists and current error messages. Do not accept additional fields, coerce values, or silently default missing required data.

### `action_text.js`: pure text resolution

Move Electron placeholder and prompt resolution here:

- `resolvePlaceholders`;
- `resolveAgentPrompt`;
- placeholder patterns.

Do not consolidate this module with `app/src/services/action_text.ts` in this job. Cross-process consolidation changes imports and module formats and belongs to a separate verified task. This job must not leave copied implementations inside `action_runner_service.js`.

### `action_run_history.js`: history construction and persistence

Use plain functions unless the final implementation demonstrates state/lifecycle that justifies a class. Own:

- combined stdout/stderr output;
- commit metadata construction;
- command history-entry construction;
- agent history-entry construction;
- the `appendActionRunHistory` request shape.

Always append command history even when no commit summary exists. Include `commit` only when detected. Preserve field order and the current command/agent entry schemas.

### Execution error types

Make cancellation and root-phase failure metadata explicit rather than continuing to attach undocumented properties throughout the facade. Because the style guide requires every class in its own file, place any new error class in its own module. Do not introduce a hierarchy unless both cancellation and phase propagation need distinct behavior.

The observable failure messages and result statuses must remain unchanged.

## Required execution flow after the split

1. `ActionRunnerService.start` validates the boundary request.
2. It verifies service readiness and snapshots project/actions folder.
3. It loads and validates the complete action graph, then resolves the requested root action. Definition errors still reject `start` before an execution id is created.
4. It creates and registers an `ActionExecution`, starts its completion promise, and returns the execution id.
5. `ActionExecution` publishes the root `execution/running` event.
6. It recursively runs linked actions in current order and stops at the first failure or cancellation.
7. Every individual action resolves its worktree independently and holds the existing repository lock during its execution/history write.
8. The chosen executor streams output/events and returns a normalized result.
9. History is written before the action terminal event. A history failure therefore remains an action failure.
10. The execution emits the action terminal event, then ultimately the root execution terminal event.
11. The facade removes the active entry, stores the terminal result, and enforces the 100-result retention limit.

## Behavior invariants

The refactor must preserve all of these details, including behaviors that may look incidental:

### Start and wait

- Unknown request fields are rejected.
- `context.kind` is one of `card`, `file`, `folder`, or `project`.
- Every defined context value must be a string.
- Unknown action definitions, circular references, persisted validation failures, and invalid persisted profiles reject `start` before process execution.
- Runtime agent/model/thinking-level errors reached during execution produce a terminal failed result rather than changing the established `start` timing.
- `wait` returns the active completion promise when execution is running.
- A completed result is removed when retrieved from the completed-results map.
- Unknown or already-consumed execution ids throw the current error.
- Only the newest 100 unconsumed completed results are retained.

### Project isolation

- An execution uses the project and actions folder captured at `start` for every linked phase, definition-derived action, conversation load, and history write.
- Calling `startProject` while an execution is active affects only future executions.
- `stop` cancels every currently registered execution, then clears the current project/actions folder.

### Chain semantics

- `onBefore`, `on`, and `onAfter` declaration order is stable.
- Every matching `on` rule runs; matching is performed against combined stdout followed by stderr using the rule's Unicode regular expression.
- A failure stops all later actions.
- A failure anywhere in the root `onAfter` subtree produces `okButNotAfter`.
- Failures in root `onBefore`, root main, root `on`, or nested subtrees outside root `onAfter` produce `failed`.
- Root-only runtime input never leaks into linked actions.

### Prompt and continuation semantics

- `extraPrompt` replaces `{{card-prompt}}` when the placeholder exists; otherwise nonblank input is appended with two newlines.
- Blank extra prompt is not appended.
- Linked actions receive no root extra prompt.
- `continueFrom` is valid only for a root agent action; a root command action fails with the current message.
- Worktree-prefixed conversation references are normalized before lookup and in the request reference.
- A source conversation must belong to the current context file, including `null` for project scope.
- Provider sessions are selected by resolved agent.
- Same-provider resume sends only context after the provider cursor.
- Provider switching sends full normalized conversation context and retains producing-agent identity.
- A valid explicit extra prompt is used for continuation; otherwise the prompt is `continue`.
- Missing-session fallback happens once and only under the exact current condition.

### Cancellation

- Cancelling an unknown execution id throws.
- Cancellation aborts a running command and calls `AgentRunnerService.stop` for an active agent run.
- If cancellation occurs before the agent start callback returns, the started run is stopped as soon as its id becomes available.
- Cancellation emits one terminal `action/cancelled` event for the active action before the root `execution/cancelled` event.
- When a process returns after cancellation, the action terminal event retains available command/conversation/reference/run/output/worktree/thinking metadata.
- No later linked phase starts after cancellation.

### Events and error isolation

- Every event retains `actionId`, `context`, `executionId`, `phase`, `rootActionId`, `status`, and `type` plus the current type-specific details.
- Command stdout/stderr chunks are emitted while status is `running`.
- Agent events remain nested in `agentEvent` running events.
- Terminal messages and exit-code mapping remain unchanged.
- One throwing listener does not prevent delivery to later listeners, affect execution status, or prevent cleanup.
- Error-reporter failures are swallowed.

### History

- Command and agent history remains keyed by action id, actions folder, and context.
- History uses the execution repository/branch returned by the worktree/process result, not mutable global project state.
- Output remains `stdout + stderr` in that order.
- Command entries contain `command`, optional `commit`, `completedAt`, `output`, empty `prompt`, and status.
- Agent entries contain `agent`, optional `commit`, `completedAt`, `model`, `output`, actual prompt, status, and thinking level.
- Commit metadata retains action id, branch, commit, completion time, repository root, and the context file path when present.

## Call-site impact analysis

The following shared dependencies are affected by internal rewiring. Their behavior must remain as stated:

| Dependency/call site | Current use | Required post-refactor behavior |
| --- | --- | --- |
| `resolveActionDefinition` | Called once by `loadRootAction` before execution creation | Keep unchanged; facade delegates directly. |
| `ActionWorktreeExecutionService.execute` | Called once for every root or linked action | Keep old behavior for every call; do not move locking to the whole chain. |
| `AgentRunnerService.start` | Called for an agent turn and possibly one missing-session fallback | Keep request/callback contract and call count semantics. |
| `AgentRunnerService.stop` | Called through execution cancellation | Keep active run-id behavior, including the start/cancel race. |
| `localGitService.loadAgentConversation` | Called only for root continuation | Keep worktree-aware project and normalized reference. |
| `localGitService.appendActionRunHistory` | Called after every command/agent result | Keep request and entry schemas; failures remain execution failures. |
| `agentConfigProvider` | Used for definition validation and runtime agent resolution | Keep both reads; do not cache configuration across executions unless existing behavior proves it safe. |
| Bridge subscription listeners | Receive every execution event synchronously | Keep ordering and listener isolation. |

No verified call site requires old and new behavior simultaneously. Do not add mode flags, compatibility branches, or duplicate execution paths.

## Implementation sequence

Keep each step behavior-preserving and leave the original file calling the extracted logic before proceeding.

1. **Pure boundaries:** extract request validation and action text resolution with their tests.
2. **Command boundary:** extract the default command runner and command-specific execution functions; preserve injected `commandRunner` tests.
3. **History boundary:** extract history/commit construction and move the relevant assertions to focused tests.
4. **Agent boundary:** extract `ActionAgentExecutor`, including continuation, provider switching, missing-session fallback, callback rejection, and cancellation hooks.
5. **Execution object:** introduce `ActionExecution`, move chain traversal/status/event/cancellation logic, and store instances in the facade registry.
6. **Facade cleanup:** reduce `ActionRunnerService` to lifecycle, registry, definition resolution, publishing, and collaborator composition.
7. **Test split:** leave facade tests covering only its public contract; move pure/executor/execution cases beside their owning modules.

Do not create temporary `*_core`, `*_facade`, or re-export files. Do not copy logic and leave the original active. Each extraction is complete only when the old implementation is removed and production calls the new module.

## Test plan

### `action_run_request.test.mjs`

- accepted minimal requests and all four context kinds;
- unsupported top-level and `runInput` fields;
- missing/invalid action id, context, context values, and optional string fields;
- default empty `extraPrompt` without hiding invalid required data.

### `action_text.test.mjs`

- root project, file, and prompt placeholders;
- missing file/root failures;
- prompt replacement, append, and blank-input behavior.

### `action_command_executor.test.mjs`

- Git-root assertion before spawn;
- stdout/stderr streaming and final buffering;
- nonzero and missing exit codes;
- abort before/during close and spawn errors;
- placeholder resolution and root-only prompt input through execution integration.

### `action_run_history.test.mjs`

- command entry with and without commit output;
- agent entry with and without commit output;
- root-commit branch parsing through the shared parser;
- project/card file path metadata;
- execution repository/branch metadata;
- persistence failure propagation.

### `action_agent_executor.test.mjs`

- initial agent action and project-wide scope;
- runtime agent/model/thinking overrides versus action defaults;
- native resume with provider cursor;
- provider switch with full context;
- switch back with incremental context;
- explicit continuation prompt and default `continue`;
- worktree-prefixed reference normalization;
- context-card mismatch;
- one confirmed missing-session fallback;
- no fallback for unrelated or post-turn failures;
- rejection callback propagation;
- active run-id set/clear and cancel-before-start-return race.

### `action_execution.test.mjs`

- exact before/main/matching-on/after order;
- every matching `on` rule and stop-after-failure;
- root-relative status for failures in every phase and nested subtree;
- independent worktree resolution for every linked action;
- root-only run input;
- streamed and terminal event order/payloads;
- cancellation in main, before, on, and after;
- no later phase after failure/cancellation;
- history-before-terminal-event behavior.

### `action_runner_service.test.mjs`

- readiness and project lifecycle;
- reload/validate definition before every start;
- start rejection versus terminal execution failure boundary;
- execution id, wait, completed-result consumption and retention;
- project/actions-folder snapshot across project switches;
- public cancel and stop delegation;
- listener and error-reporter isolation;

Use existing fixtures where useful, but do not introduce one oversized shared mock that recreates the whole service graph in every unit test. Tests for a collaborator should replace only its direct dependencies. Keep at least one integration-style runner test with real `ActionExecution` and executor collaborators to prove composition and event ordering.

## Edge cases and failure modes

- `startProject` changes the singleton state while an existing execution is between linked phases.
- `stop` iterates active executions while cancellation events are being delivered.
- a listener cancels an execution from inside a running event;
- a listener throws while another listener still needs the same event;
- command spawn emits `error` and `close`, or abort races with either event;
- an agent completes synchronously inside `AgentRunnerService.start` before the returned run id is assigned;
- an agent start rejects through the rejection callback;
- cancellation occurs during first resume attempt or missing-session fallback;
- history append fails after a process succeeded;
- provider cursor references a missing message;
- transcript has no usable normalized content;
- project-wide continuation has `cardPath: null` while a card-scoped log has a file;
- several completed executions are never awaited and exceed the retention limit;

## Compatibility and side effects

- No renderer, preload, IPC, remote-control, scheduler, action-definition, history, or conversation schema changes.
- No changes to action-chain semantics, status names, error messages, event order, or event payload fields.
- No changes to worktree locking scope.
- No changes to agent provider protocol or transcript normalization.
- No React-side action runner or duplicated orchestration is introduced.
- No edit to `design/architecture/architectural_decisions.md`; this job applies the existing service and file-ownership rules.
- The only expected production effect is module ownership and smaller files. If an existing test exposes ambiguous behavior, stop and resolve the intended behavior instead of silently changing it as part of the refactor.

## Acceptance criteria

- `ActionRunnerService` is a lifecycle/registry facade and contains no chain traversal, command spawning, agent continuation, callback-to-promise adaptation, placeholder implementation, or history-entry construction.
- One `ActionExecution` instance owns each execution snapshot, chain traversal, cancellation, root-phase classification, and event construction.
- Agent continuation and missing-session retry live in one `ActionAgentExecutor`; provider protocol logic remains in `AgentRunnerService`/existing protocol modules.
- Command execution uses focused functions and retains the injectable command-runner seam.
- Request validation, text resolution, and history construction are moved—not copied—to focused modules with direct unit tests.
- Every verified public call site keeps its current API and behavior.
- All behavior invariants in this report are covered by focused or integration tests.
- `action_runner_service.test.mjs` is split by ownership and no replacement test file becomes another monolith.
- No production file created by the split exceeds roughly 400 lines; `action_runner_service.js` is approximately 200 lines or less.
- No compatibility flags, fallback shapes, forwarding service classes, `*_core` files, or re-export shims are added.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in `desktop/`; all warnings, errors, and failures are resolved.

## See also

- [[J-002]]
- [[J-008]]
- [[J-013]]
- [[B-050]]
- [[B-064]]
- [[B-066]]
- [[F-010c]]
- [[F-010d]]
- [[F-047]]
- `design\architecture\initial description\writings\running_actions.md`
