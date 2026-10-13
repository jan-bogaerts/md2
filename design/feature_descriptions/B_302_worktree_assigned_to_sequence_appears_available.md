---
author: 
id: B_302
internalId: 06697134-10b3-44b2-a8c6-e35881b33f56
title: worktree assigned to sequence appears available
status: ready
owner: 
affects:
agents:
  - design/activity/card__06697134-10b3-44b2-a8c6-e35881b33f56.json
policy:
after: 9e01cab5-8f41-4ea9-9ded-d6358a458537
changedFiles:
  - app/src/components/actions/run/sequence/card_sequence_dialog.test.tsx
  - app/src/components/actions/run/sequence/card_sequence_dialog.tsx
  - app/src/components/actions/run/sequence/card_sequence_draft_service.node.test.ts
  - app/src/components/actions/run/sequence/card_sequence_draft_service.ts
  - app/src/components/worktree_selector.test.tsx
  - app/src/components/worktree_selector.tsx
  - app/src/services/actions/active_schedule_service.node.test.ts
  - app/src/services/actions/active_schedule_service.ts
  - app/src/services/project/worktree_service.node.test.ts
  - app/src/services/project/worktree_service.ts
---

we assigned a worktree to a sequence, but the worktree still appears as available in the popup used by the cards to assign a worktree (and likely that of actions as well).

The user should not be allowed to select an already used worktree. so if the worktree is assigned to a sequence, it should be disabled, like usual.

Note: this is most likely best done in the service that manages the available worktrees.

## Current state

* `WorktreeSelector` (`app/src/components/worktree_selector.tsx`) is used by the card worktree indicator and by the action popup (`action_worktree_selector_owner.tsx`). For a card target, each worktree menu item is disabled when `worktreeService.isWorktreeAvailableForCard(record.branch, cardInternalId)` returns false.
* `WorktreeService.isWorktreeAvailableForCard` only checks two sources: pending card assignments (`pendingAssignments`) and active cards whose `header.branch` equals the worktree branch. Sequence schedules are never consulted, so a worktree used by a sequence shows as selectable.
* `WorktreeService.setCardWorktree` uses the same check as its guard, so assigning a sequence worktree to a card is also not rejected in the renderer.
* Sequence worktree data lives in the schedule file (`.md2-schedules.json`), loaded by `ActiveScheduleService.setSchedules`:
  * `SequenceSchedule.worktreeBranch`: the branch of the linked worktree the user picked when creating the sequence. Present for pending and running sequences.
  * `SequenceSchedule.branchProgress.checkoutPath`: the folder of that worktree. Written by the desktop when the sequence starts (`sequence_worktree_execution.js`, `prepareNow`).
  * Once running, the desktop switches the checkout to `md2/sequence/<uuid>` and child branches. The worktree record's `branch` then no longer equals `worktreeBranch`, so a running sequence can only be matched by checkout path.
* `ActiveScheduleService` currently derives only `sequenceCardWorktrees` (running sequences, keyed by current card), used by B_301 / `CardWorktreeIndicator` to show a read-only selector.
* The desktop holds a lease on a running sequence checkout (`checkout_ownership_service.js`), so a card `prepareWorktree` on it fails late with `Checkout is owned by a sequence`. Pending sequences have no lease.
* The sequence dialog (`card_sequence_dialog.tsx`) lists all worktrees; it only disables invalid ones. Worktrees assigned to cards or to other sequences are selectable. `CardSequenceDraftService.validationMessage` does not check the worktree.
* Import direction: `data_service` imports `worktree_service`; `active_schedule_service` imports `data_service`. `worktree_service` therefore cannot import `active_schedule_service` (cycle).

## Implementation details

Definition: a worktree is **reserved by a sequence** when a sequence schedule with status `pending` or `running` has a `worktreeBranch`, and either
* the schedule has `branchProgress` and its `checkoutPath` equals the record path (path key compare, same as `worktreePathKey`), or
* the schedule has no `branchProgress` and its `worktreeBranch` equals the record branch.

### `WorktreeService` (owner of availability)

* Add model field `sequenceReservations: SequenceWorktreeReservation[]` where `SequenceWorktreeReservation = { checkoutPath: string | null, worktreeBranch: string }`.
* Add `setSequenceReservations(reservations)`: replace the list; dispatch `assignmentChanged` only when content changed.
* Add `isWorktreeReservedBySequence(record: WorktreeRecord)`: applies the definition above.
* Add `isWorktreeAvailableForSequence(record: WorktreeRecord)`: false when reserved by a sequence, when any active card has `worktree` set and `header.branch === record.branch`, or when `pendingAssignments` contains `record.branch`.
* `clear()` does not reset reservations; they are owned by `ActiveScheduleService` which clears them on project change.

Call sites of `isWorktreeAvailableForCard` (unchanged signature and behavior):
* `worktree_selector.tsx` menu item: add `|| worktreeService.isWorktreeReservedBySequence(record)` to the card-target disabled condition.
* `setCardWorktree`, `selectedBranch` check: also throw `Worktree branch <branch> is assigned to a sequence` when `resolution.record` is reserved by a sequence.
* `setCardWorktree`, `branchName` check: unchanged (card branch name, not a worktree record).

### `ActiveScheduleService` (source of reservations)

* In `setSchedules`, collect `{ checkoutPath: schedule.branchProgress?.checkoutPath ?? null, worktreeBranch }` for every sequence with `worktreeBranch` and status `pending` or `running`; call `worktreeService.setSequenceReservations(...)` once. `stop()` and project change already call `setSchedules([])`, which clears them.
* `active_schedule_service.ts` imports `worktreeService` directly (no cycle).

### Sequence dialog

* `card_sequence_dialog.tsx`: worktree option disabled when `!valid || !worktreeService.isWorktreeAvailableForSequence(record)`.
* `CardSequenceDraftService.validationMessage`: when `worktreeBranch` is set and its record is missing or unavailable, return `Selected worktree is already in use`. Covers a worktree that became used after selection; `createRegistrationRequest` already rejects on validation messages.

### Out of scope

* Project-level target in `WorktreeSelector` (action popup without card): never disabled today; unchanged.
* Live re-render of an already open menu when reservations change: menus read availability at render, same as existing card checks; `setCardWorktree` guard and draft validation catch the race.
* Desktop-side validation of schedule registration.

### Edge cases

* Running sequence: record branch differs from `worktreeBranch`; match by `checkoutPath`.
* Completed, failed, cancelled sequences: no reservation.
* Card already assigned to that worktree before the sequence was created: unaffected; its own menu shows its active-worktree actions, not the list.

### Tests

* `worktree_service.node.test.ts`: reserved by pending sequence (branch match), by running sequence (path match with different branch), not reserved for completed sequence; `setCardWorktree` rejects a sequence-reserved worktree; `isWorktreeAvailableForSequence` false for card-assigned and sequence-reserved worktrees.
* `active_schedule_service.node.test.ts`: `setSchedules` pushes reservations for pending/running sequences with `worktreeBranch` only; clears on stop.
* `worktree_selector.test.tsx`: card menu item disabled when reserved by a sequence.
* `card_sequence_dialog.test.tsx`: worktree option disabled when used by a card or another sequence.
* `card_sequence_draft_service.node.test.ts`: validation message when selected worktree becomes unavailable.

## Acceptance criteria

* Card worktree menu: a worktree used by a pending or running sequence is shown disabled.
* Action popup worktree menu for a card: same as above.
* Assigning a sequence-reserved worktree to a card through `setCardWorktree` fails with a clear error and no desktop call.
* Running sequence whose checkout is on a sequence branch still reserves that worktree.
* Worktree becomes selectable again once the sequence is completed, failed, or cancelled.
* Sequence dialog: worktrees assigned to active cards or reserved by another pending/running sequence are disabled; submitting with such a worktree is blocked with `Selected worktree is already in use`.
* Existing card-to-card reservation behavior unchanged.
