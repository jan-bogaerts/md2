---
author: 
id: B_240
internalId: e847c29c-a563-4203-860f-8d839e31e8f7
title: reconcile stale running conversations at startup
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e847c29c-a563-4203-860f-8d839e31e8f7.json
policy:
after: d268cc88-c21e-4d97-a7bb-1491da4852b3
---
Close conversations left as running by a crash or a failed terminal write. Safety net behind [B\_239](B_239_always_write_terminal_activity_record.md); split from [B\_235](B_235_end_of_action_not_logged.md).

## Current state

Nothing reconciles persisted conversation status against reality. A conversation whose activity file says `running` while no process exists stays that way indefinitely: the app restarts, the file is loaded as-is, and the card shows a spinner for a run that ended long ago. [B\_239](B_239_always_write_terminal_activity_record.md) removes the known causes, but a hard crash or a kill during the terminal write can still produce one, and existing projects already carry such records.

`waitingForInput` must not be swept up here. A suspended streaming run is legitimately persisted as `waitingForInput` and is resumed later; `handleClose` preserves it deliberately through `preserveWaitingState` (`agent_runner_service.js:726`). Only `running` with no live process is impossible.

## implementation details

* At project load, after run recovery has established which runs are genuinely live, scan activity conversations for status `running`. Reuse the existing recovery snapshot (`loadRunRecoverySnapshot`) as the source of truth for liveness rather than inventing a second one.
* A `running` conversation with no live run is transitioned to `failed` with an explicit cause naming the reconciliation, so the record is distinguishable from a normal agent failure, and persisted.
* `waitingForInput` and every terminal status are left untouched.
* Reconciliation runs once per project load and is ordered before card conversations are published, so no window ever renders the stale value.
* Log each reconciled conversation with its id and activity path.
* Tests: a `running` record with no live run is closed as failed; a `running` record whose run is recovered is untouched; a suspended `waitingForInput` record is untouched; reconciliation is idempotent across repeated loads.

## acceptance criteria

* Starting the app never leaves a conversation showing as running when no process is running it.
* Suspended conversations waiting for input survive restart unchanged and remain resumable.
* Reconciled conversations carry a cause that identifies them as reconciled, not as a normal agent failure.
* Running the reconciliation twice changes nothing the second time.