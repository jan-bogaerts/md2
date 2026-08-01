---
author:
id: J-024
internalId: 1975a005-f0bb-432f-8ecb-bc85a27819d2
title: replace global execution state with scoped action runs
status: ready
owner:
affects:
  - app/src/data/action_run_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/components/hooks/use_action_executions.ts
  - app/src/services/actions/action_execution_service.ts
  - desktop/src/actions/action/action_execution.js
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
  - shared/card_activity.mjs
policy:
  checkLinting: true
  requireTests: true
after: 1244ac27-293a-4a5f-b478-0890ecc3fea6
---

## Goal

Replace execution terminology and the global renderer snapshot with action-run terminology, a routing registry, and stable scoped run stores.

## Terminology

- `runId`, not `executionId`.
- `ActionRun`, not `LiveActionExecution` or action execution.
- `ActionRunRegistry`, not `ActionExecutionService`.
- `ActionRunStore`: stable state owner for one run.
- `runs`, not `executions`.
- `ConversationEntry` remains reserved for items inside an agent conversation.

Rename the contract consistently across Electron, bridge messages, renderer services, hooks, persisted action records, errors, and tests. Process execution may keep that term only where it refers to an operating-system process.

## Registry shape

`ActionRunRegistry` keeps one renderer-wide bridge subscription and a routing map from `runId` to stable `ActionRunStore`. The map is an internal index, not a React snapshot.

Each `ActionRunStore` owns one run's status, logs, root action, active chained action, context, conversation, approvals, and question. Incoming events identify `runId`, root action ID, active action ID, and context, then update only that store.

Provide separate scoped indexes/subscriptions for:

- one run by `runId`;
- the run bound to one root action and context;
- active statuses for one context;
- the global active-run list used only by the global indicator.

Remove the undifferentiated global `changed` event and complete-run snapshot. Unrelated run changes must preserve selected store snapshots and must not render their consumers.

## Persistence and lifecycle

- Preserve per-card persistence: `card__<cardId>.json` contains all action runs and conversations for that card.
- Preserve `project.json` for project-context runs.
- Persist every terminal run; do not discard persisted runs because of memory limits.
- Rename persisted `executionId` to `runId` and update the activity schema directly. Do not retain both names.
- Remove `RETAINED_EXECUTION_LIMIT` and `COMPLETED_EXECUTION_LIMIT`.
- Active run state remains until terminal persistence and waiting consumers complete.
- A terminal `ActionRunStore` remains while explicitly retained by a mounted consumer, then releases through a defined lifecycle.
- Reopening historical results loads persisted card/project run data instead of depending on an arbitrary in-memory cache.
- No count-, age-, or size-based silent eviction.

## Call-site behavior

- Context-specific entry points subscribe only to their context status.
- A popup leaf bound to one action/context receives only that run.
- Global running indicators may subscribe to the active-run aggregate.
- Start, wait, cancel, finish, question, approval, and agent-message commands use `runId`.
- Prompt draft ownership is absent after J-022.

## Acceptance criteria

- [ ] User-facing action lifecycle code uses run terminology consistently.
- [ ] One stable `ActionRunStore` owns each active run.
- [ ] Registry routing never exposes all runs as one React snapshot.
- [ ] Every subscription is run-, action/context-, context-, or explicitly global-active scoped.
- [ ] Updating one run does not render consumers of another run.
- [ ] Both hardcoded 100-item limits are removed.
- [ ] Every terminal run is persisted in its card or project activity file.
- [ ] Terminal in-memory cleanup follows explicit persistence/consumer lifecycle rules.
- [ ] App, desktop, and shared parser lint and tests pass.

## Dependencies

J-022 and J-023 must be implemented first.
