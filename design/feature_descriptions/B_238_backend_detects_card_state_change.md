---
author: 
id: B_238
internalId: 0f3edcd4-a27e-45e8-a6f1-4f3cf25cb096
title: backend detects card state change
status: ready
owner: 
affects:
agents:
  - design/activity/card__0f3edcd4-a27e-45e8-a6f1-4f3cf25cb096.json
policy:
changedFiles:
  - app/src/services/data/data_service.ts
  - app/src/services/data/markdown_parsing_service.ts
  - desktop/src/actions/card/card_state_tracker.js
  - desktop/src/actions/card/card_state_tracker.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
---
Detect the card state transition that ends an action on the backend instead of routing it through a renderer. Split from [B\_235](B_235_end_of_action_not_logged.md).

## Current state

An agent finishes work by writing a new `status` into the card markdown header. Auto-finish and schedule triggers must react to that write.

Today the detection round-trips through the UI. The backend watcher `watchProject` (`desktop/src/project/project_files.js:400`) sees the file change and forwards it to the renderer through `local_bridge_dispatch.js:314`. The renderer reloads the card, parses the header, compares `previousCard.header.status` against the new value (`app/src/services/data/data_service.ts:561`, and the card-operations callback at `:162-170`), and calls back into the backend through `notifyActionCardStateChange`. That lands at `local_bridge_dispatch.js:454` and fans out to `ActionRunnerService.handleCardStateChange` (`action_runner_service.js:351`) and `ActionSchedulerService.handleCardStateChange` (`action_scheduler_service.js:194`).

Every connected window runs that comparison, so with two windows open the same transition is reported twice and `requestAutoFinish` (`action_run.js:273`) can fire twice for one run. With no window focused on the card, or a window mid-reload, it can arrive late or not at all. Nothing under `desktop/src` reads a card markdown header today; the backend resolves cards by `cardInternalId` everywhere but never loads one from disk.

## implementation details

* Add backend card-header reading: for a changed card file, parse the frontmatter and extract `internalId` and `status`. Reuse the shared parsing used by the renderer rather than writing a second parser.
* Backend keeps the last known status per `internalId` and calls `handleCardStateChange` itself only on an actual transition. Both consumers, run auto-finish and the scheduler, move together.
* Remove `notifyActionCardStateChange` from the renderer, from the bridge dispatch, and from the preload surface. The renderer no longer participates in auto-finish.
* Handle card rename and move without emitting a spurious transition: identity is `internalId`, not path. A deleted card drops its remembered status.
* Handle the card file being written by the backend itself the same way as an external write; the trigger is the resulting status, not the writer.
* Tests: two connected renderers produce exactly one auto-finish; a transition with no renderer attached still triggers; rename with unchanged status triggers nothing; repeated identical writes trigger once; scheduler and auto-finish both observe the same single transition.

## acceptance criteria

* Card state transitions are detected on the backend from the card file, with no renderer involvement.
* One transition produces exactly one auto-finish request regardless of how many windows are open, including none.
* Renaming or moving a card produces no state transition.
* Scheduler triggers and action auto-finish consume the same backend-detected transition.