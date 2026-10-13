---
author: 
id: B_301
internalId: 9e01cab5-8f41-4ea9-9ded-d6358a458537
title: action popup running in sequence wrong worktree
status: ready
owner: 
affects:
agents:
  - design/activity/card__9e01cab5-8f41-4ea9-9ded-d6358a458537.json
policy:
after: 26179cc3-97a2-4a33-9e4f-a3b7116e217c
branch: b_301_action_popup_running_in_sequence_wrong_worktree
worktree: 2
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_frame.tsx
  - app/src/components/actions/run/popup/action_worktree_selector_owner.tsx
  - app/src/components/card_view/card_worktree_indicator.tsx
  - app/src/components/sequence_worktree_assignment.node.test.ts
  - app/src/components/sequence_worktree_assignment.ts
---

we recently fixed it so that we show the worktree on the card, in read-only mode when it has an action running within the context of a sequence that also has a worktree assigned.

however, we don't show this on the action popup for the card. there, the icon still says that it is on the main worktree.

## Current state

* `ActiveScheduleService` exposes the running sequence's checkout path and expected branch for its current card, keyed by `Card.header.internalId`. It removes that value when the sequence advances or stops.
* `CardWorktreeIndicator` uses that value to show the sequence checkout with disabled controls. It checks the checkout path against current worktree records and reports a missing checkout or changed branch.
* The action popup instead builds its worktree icon from the card's persistent assignment through `useActionAssignmentContext` and `ActionPopupFrame`. An unassigned card therefore shows the primary worktree while its sequence action runs elsewhere. `ActionWorktreeSelectorOwner` disables controls only when its bound run is active.

## Implementation details

* In the action popup's worktree selector owner, subscribe to `ActiveScheduleService.subscribeSequenceCard` for card contexts with a `cardInternalId`; read `getSequenceWorktreeForCard` with `useSyncExternalStore`. Keep this subscription in the selector owner so sequence updates do not rerender the whole popup.
* When that value exists, display the sequence checkout and expected branch using the same path match, missing-checkout error, changed-branch error, and disabled explanation as `CardWorktreeIndicator`. A shared pure projection may serve both indicators. The sequence checkout is a temporary display value, not a card assignment.
* Disable the popup's worktree controls while the sequence value exists, including when no popup-bound run is active. When the value disappears, show the card's current assignment again and retain the existing bound-run disabling rule. Leave project and non-card popups unchanged.
* Keep the sequence display value out of `assignmentContext`, action filtering, run requests, and persisted card data. The running sequence already owns its execution checkout; this change only corrects the icon.
* Add a focused popup test for a card without a persistent worktree assignment: sequence checkout appears while running, controls stay disabled, and primary assignment returns when the sequence advances or stops. Cover missing checkout and changed branch with the same visible errors as the card indicator.

## Acceptance criteria

* While a sequence runs an action for a card, that card's action popup shows the sequence checkout rather than the primary or persistently assigned card worktree. Its tooltip explains why controls are disabled.
* The icon updates in an already open popup when the sequence checkout changes or the sequence advances, completes, fails, or is cancelled. After the sequence leaves the card, the icon shows the card's current assignment.
* If the checkout is missing or its branch changed, the popup reports the corresponding sequence worktree error and keeps controls disabled.
* Showing the sequence checkout does not change the card assignment, action context, conversation binding, or execution worktree.
