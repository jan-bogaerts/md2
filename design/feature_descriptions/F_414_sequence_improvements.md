---
author: 
id: F_414
internalId: 0c0b067b-4eb0-4e90-b31c-ef53afcdbad0
title: sequence improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__0c0b067b-4eb0-4e90-b31c-ef53afcdbad0.json
policy:
branch: f_414_sequence_improvements
worktree: 1
---

* adding a sequence is similar as cards, actions, diagrams: add the button there, not on the run tab
* the popup must be floating and take part of the popup stack like other popups (action, card). otherwise the drag-drop feature used on the sequence popup simply doesnt work
* a sequence need to be assignable to a worktree. all cards and actions run in that worktree.
  * a card that is already assigned to a worktree can't be added to the sequence
* when the sequence is executing the actions in the worktree, it needs to:
  * create a branch that represents the full sequence
  * create a new branch for each card/action that it runs, this starts from the sequence-branch.
  * after a card/action is done, it's branch is merged back into the sequence-branch\
    This should allow us to track the changes done for that card, like we have now when we merge the worktree back into the main repository
  * at the end of the sequence, the sequence-branch is the active branch, sub branches should be removed.
## Current state

- `app/src/components/shell/menu/app_menu.tsx` places Add sequence on the Run/agents tab, apart from New card, New action, and New diagram.
- `card_sequence_dialog.tsx` uses a nonmodal MUI Dialog. Desktop and mobile card views host it inside their board drag-and-drop context, but it is absent from `CardPopupService`. Popup stack means the shared ordered popup entries that control layering, activation, and dismissal. Moving the surface alone does not prove dragging works; board collision detection and drag overlays also need verification.
- `CardSequenceDraftService` owns ordered `cardInternalIds`, one selected `actionId`, ready state, and trigger. Worktree assignment is absent; assigned cards are currently addable. Registration and persisted `SequenceSchedule` also have no sequence worktree or branch progress.
- `ScheduledCardSequenceEngine` runs the same action once per card. Advancement requires successful completion of the full action run and the configured ready state having been observed; either can happen first. Context resolution and backend card-state detection currently read the primary project checkout.
- Regular card worktree preparation creates a new branch from the opened project branch. `ActionWorktreeRunService` resolves the checkout through its current branch and passes that repository to regular actions, including before/after actions. Branch switching therefore invalidates a stale worktree binding.
- Regular actions auto-commit agent-reported changed files only when `trackFileChanges` is enabled and execution succeeds. Commands and other agent actions retain their existing commit behavior. Worktree integration requires a clean source, rebases when needed, and creates a squash commit: one target commit containing the source changes, without retaining source commit ancestry. Integration records that commit in card activity.

All requested changes are feasible. Reusing regular action execution and integration rules is appropriate; sequence-specific work is ownership of the shared checkout, branch transitions, and recovery. Existing `prepare()` and `integrate()` cannot be called unchanged for every transition: they target the opened project branch and integration operates across two checkouts, whereas sequence children share one checkout.

## implementation details

### Confirmed behavior

- Keep one selected action across ordered cards. One child branch represents one card's complete action run; standalone actions and per-card action selection are outside this feature.
- Worktree assignment is optional. Without assignment, preserve current sequence execution and regular action worktree requirements; create no sequence or child branches. Reject cards already assigned to a worktree in either mode.
- With assignment, create the sequence branch from the opened project branch, matching regular new-branch preparation. Each child starts from the latest sequence branch, so later cards receive earlier integrated changes.
- Use regular action commit policy and regular squash integration. Do not add unconditional auto-commit or `--no-ff` merge behavior. If uncommitted changes remain when integration is due, stop with a clear error and preserve them.
- After failure or cancellation, leave checkout, working files, index, branches, and any conflict state as they stand. Do not reset, abort, park, switch, or delete branches automatically. Normal action activity recording and sequence failure/cancellation persistence still apply.

### UI and validation

- Move Add sequence beside existing creation controls; retain local-backend and writable-project restrictions. Replace the Dialog surface with `ResizablePopper` and register a sequence entry in the existing popup stack. Preserve the draft when another popup becomes active; close and project-change handling must clear both entry and draft.
- Keep the popup within the existing desktop/mobile board drag-and-drop context. Preserve picker insertion, board-card drops, reordering, selection, Delete removal, and bottom-right actions. Use existing theme and popup conventions.
- Store optional worktree selection in the draft and registration request. Evaluate action availability against each card plus the selected sequence worktree, without writing worktree assignments into card headers.
- Enforce assigned-card rejection in picker, drop handling, draft validation, desktop registration, and immediately before each run. Treat invalid/unresolved existing assignments as assigned, not eligible. Resolve cards by `Card.header.internalId`; paths remain loading/saving references.

### Execution and persistence

- Extend `shared/action_schedules.mjs`, its declarations, the action bridge request, and scheduler registration with optional sequence assignment and durable branch progress. Preserve schedules with no assignment as ordinary unassigned sequences. Persist selected checkout location, expected current branch, sequence branch, child branch, run ID, integration commit, and transition phase. Checkout location binds execution; schedule ID and card internal ID remain domain identities.
- Before activation, revalidate the selected linked worktree, require a clean checkout, and prevent overlapping sequence/action runs and UI mutations from using that checkout. Current per-card run claims do not provide checkout exclusivity. Keep ownership through ready-state waits and branch integration; stop conservatively if external Git changes invalidate the expected checkout.
- Prepare the sequence branch once. Before each card, prepare its child from the current sequence branch and refresh the execution binding. Pass the effective worktree context through the normal action runner for the entire action chain. Do not temporarily assign the shared worktree to individual card headers.
- Read card data and observe ready-state transitions in the execution checkout for assigned sequences. Scope observations to that checkout so primary-project events cannot advance the wrong sequence. Keep schedule persistence in its existing primary-project location and retain normal conversation/activity ownership.
- Once the full run succeeds and readiness is satisfied, require a clean child checkout, switch to the sequence branch, squash-integrate the child, and record the resulting commit in that card's activity using the existing system integration-record format. Reference the sequence branch so history stays visible after child deletion. A child with no net changes needs no empty integration commit and must still advance.
- Integrate before advancing. Keep child branches until every card succeeds; then leave the sequence branch checked out and delete only branches created for that sequence. Do not merge into the primary project automatically. Reuse regular integration later; its final squash produces one project commit and does not preserve per-card ancestry.
- Persist transition intent before Git mutations and completion afterward. On restart, compare saved phase, branch, and commit with actual Git state before continuing. Never rerun an unknown action outcome or repeat an already recorded integration. If recovery cannot prove the next step, report failure and preserve Git state. Record integration activity once, including recovery after an activity-write failure.

### Shared behavior impact

- `WorktreeService.prepare()`: existing bridge caller and renderer `setCardWorktree()` retain opened-project base and naming behavior. Sequence preparation needs an explicit base branch; reuse branch-validation/switch primitives rather than changing regular behavior globally.
- `WorktreeService.integrate()`: existing bridge integration/finalization retains primary-project squash workflow. Sequence integration reuses squash/commit metadata primitives with the sequence target in the shared checkout; it must not run primary-project synchronization/reset logic.
- `ActionWorktreeRunService.resolve()`: prompt preparation, compact-only runs, and ordinary action phases retain existing resolution. Sequence phases receive refreshed child-branch bindings. `runWithCardLock()` retains release protection; checkout ownership adds protection for sequence execution.
- Scheduler card-context resolution serves ordinary scheduled actions, trigger cards, and sequence cards. Ordinary actions and trigger cards keep primary-project resolution; assigned sequence cards use their execution checkout. `cardSequenceActions()` has one production caller, the sequence builder, and should evaluate its selected assignment directly.
- Card activity is read by card history and action settings. Both retain existing activity format and visibility rules; add integration references through the existing writer rather than a second history store.

## acceptance criteria

1. Add sequence appears beside existing creation controls and is absent from the Run tab. Unsupported backend/read-only restrictions remain.
2. Sequence popup shares activation, layering, dismissal, and project-change cleanup with card/action popups. Desktop board drops work while other popups are open; picker insertion, reordering, and Delete removal remain usable. Verify mobile behavior separately with existing responsive conventions.
3. Unassigned sequences retain existing execution. Assigned sequences run every action phase in the selected checkout without changing card worktree headers. Assigned or invalidly assigned cards are rejected through every insertion/registration path and if assigned after registration.
4. Sequence branch starts from the opened project branch. Each child starts from the latest sequence result. Branch names do not overwrite unrelated branches; stale checkout bindings fail clearly.
5. Regular action commit rules remain unchanged. Dirty child integration stops without committing extra files or discarding changes. Successful integration produces a per-card squash commit and visible card activity reference; unchanged cards advance without empty commits.
6. Next card starts only after successful full-run completion, readiness, and integration. Both readiness/completion event orders and duplicate events work; worktree-only card edits can satisfy readiness without primary-project edits.
7. Successful sequence leaves its sequence branch active and removes its own child branches only after all cards finish. No automatic primary-project integration occurs. Failure/cancellation starts no further cards and performs no Git cleanup.
8. Concurrent sequences, ordinary actions, and UI checkout mutations cannot interfere with an owned sequence checkout. External branch changes, missing cards/actions/worktrees, conflicts, and persistence/history-write failures produce clear errors and preserve recoverable work.
9. Restart at each persisted branch/integration phase neither repeats completed work nor deletes unfinished work. Unknown run outcomes stop instead of rerunning. Integration history is recorded once.
10. Add focused regression tests beside popup/menu, draft/action availability, schedule parser/registration, engine, checkout ownership, and activity code. Mock Git/watchers and other external boundaries; test event ordering, recovery, dirty/no-change results, and cancellation. During implementation run affected test files independently and subproject lint; do not run full suites unless requested.
