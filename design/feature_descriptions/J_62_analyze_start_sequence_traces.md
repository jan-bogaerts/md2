---
author: 
id: J_62
internalId: bbe6b563-0434-45c3-bb65-2218d30606b0
title: analyze start sequence traces
status: ready
owner: 
affects:
agents:
  - design/activity/card__bbe6b563-0434-45c3-bb65-2218d30606b0.json
policy:
changedFiles:
  - app/src/components/actions/run/sequence/card_sequence_registration.node.test.ts
  - app/src/components/actions/run/sequence/card_sequence_registration.ts
  - desktop/main.js
  - desktop/src/actions/schedule/sequence_worktree_execution.test.mjs
  - desktop/src/git/worktree_service.js
  - desktop/tmp_edit.py
  - desktop/tmp_edit_scheduler_tests.py
---

Starting a sequence takes a long time. the `add sequence` popup also remains open long after it is visually clear that the first action already started.

This trace is from the renderer side: [Trace-renderer start sequence.json](file:///C:/Users/janbo/Documents/dev/Trace-renderer%20start%20sequence.json)

This trace is from the desktop app: [CPU-start sequence.cpuprofile](file:///C:/Users/janbo/Documents/dev/CPU-start%20sequence.cpuprofile)

The desktop app seems to do a lot of stuff. Meanwhile, the renderer seems to wait far too long.

What is the problem here? what is the sequence in the algorithm. how can we improve?

## Findings

The renderer waits for sequence registration, immediate activation, and a subsequent active-schedule refresh before closing the popup. Immediate activation includes worktree preparation, branch creation, schedule recovery writes, current-card context resolution, action startup, and initial conversation persistence. The popup does not need the result of those operations.

Registration also repeats work already represented by loaded application state:

* It loads the active-card project separately for every selected `cardInternalId` and validates card fields that are not required to persist the sequence.
* It resolves the action, validates agent settings, probes the executable, and loads the model catalog. Action execution performs the relevant resolution and executable check again.
* It performs a live worktree resolution. That resolution refreshes every linked worktree before revalidating the selected worktree. Sequence preparation and action execution repeat worktree resolution again.

The desktop CPU profile is mostly idle while it waits for filesystem operations and Git child processes. The delay is caused by synchronous orchestration and repeated I/O, not sustained CPU use.

## Revised registration flow

1. The renderer creates the registration request from its already-loaded card, action, agent, model, trigger, and worktree state.
2. The desktop validates only the request and persisted schedule shape. Registration does not load cards, resolve the action, probe an agent executable, load a model catalog, or run Git.
3. The desktop persists the sequence with `pending` status.
4. The desktop returns the persisted schedule immediately.
5. The renderer applies the returned schedule to `activeScheduleService` and closes the popup. It does not await an active-schedule refresh.
6. For a `now` trigger, the desktop queues activation without awaiting it. Other triggers are reconciled asynchronously.
7. Later schedule events or repository watch events reconcile the renderer with `running`, `completed`, or `failed` state.

Only malformed requests or persistence failures keep the popup open and show an error. Preparation or execution failures belong to the persisted sequence and must not reopen or delay the popup.

## Revised activation flow

1. Resolve the action when execution starts. An unknown or invalid action fails the sequence.
2. Resolve the configured agent settings when the agent action starts. Probe the executable at the existing execution boundary. Do not load the model catalog from the scheduler; provider rejection is an execution failure.
3. Resolve card context only for the current step when execution requires it. Registration performs no card lookup or card-field validation.
4. Obtain the selected worktree from the existing `WorktreeService` records. Do not run `git worktree list` and do not refresh unrelated worktrees.
5. Validate only the selected checkout path against the expected repository, branch, cleanliness, and checkout ownership, then acquire its sequence lease.
6. Store the resolved checkout path and expected branch in sequence progress. Subsequent phases use direct checks against that checkout instead of resolving the original worktree branch again.
7. Prepare the sequence branch, child branch, watcher, and action asynchronously. Persist recovery phases as required, but never make popup lifetime depend on them.

Global periodic worktree refresh remains independent UI maintenance. Sequence registration and activation must not await it.

## Required changes

* Remove per-card context resolution from `registerSequenceSchedule`.
* Remove action, agent executable, model catalog, and live worktree validation from `registerSequenceSchedule`.
* Return after the pending schedule has been persisted and start immediate activation without awaiting it.
* Let `activeScheduleService` accept the returned schedule directly so popup closure does not depend on a reload.
* Add a selected-record worktree preparation path that uses existing records and performs targeted live checks only for that checkout.
* Let sequence-owned action execution use its leased checkout path without calling the general branch resolver again.
* Keep execution failures visible through the active schedule state.

## Testing implications

Tests must verify that registration returns after persistence while activation remains pending, the popup closes before activation completes, and asynchronous failures produce a failed schedule. Worktree tests must verify that starting a sequence does not inspect unrelated worktrees and that targeted repository, branch, cleanliness, and ownership failures stop activation safely.
