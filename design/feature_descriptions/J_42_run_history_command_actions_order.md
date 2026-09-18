---
author: 
id: J_42
internalId: b4c6118b-6976-41ec-b33e-bd93e66eda89
title: run history command actions order
status: ready
owner: 
affects:
agents:
  - design/activity/card__b4c6118b-6976-41ec-b33e-bd93e66eda89.json
policy:
after: 421a382c-ec00-4741-a8f7-eab2a949fcfe
changedFiles:
  - app/src/components/actions/run/state/action_run_history.test.tsx
  - app/src/components/actions/run/state/action_run_history.tsx
---

the run history in the command actions popup is from oldest to newest, it should be the other way round, newest at the top.&#x20;

also, include date and time when it ran

## Current state

Electron appends action records to activity files. `loadActionRunHistory` in `desktop/src/actions/action/action_files.js` filters those records by root action ID and returns them in stored order, so older runs reach renderer first. `ActionHistoryStore` preserves that order, and `ActionRunHistory` renders it unchanged in command-action popup.

Every history entry already contains validated ISO `startedAt` and `completedAt` timestamps. `ActionRunHistory` formats `completedAt` with user's locale, short date, and short time for agent rows, but command rows currently render only status and output. Here, **newest** means run with latest `completedAt`; displayed date and time mean that completion timestamp.

## implementation details

* In `app/src/components/actions/run/state/action_run_history.tsx`, derive newest-first display order from `completedAt` without mutating `entries`. Keep persisted activity order, Electron response, and `ActionHistoryStore` snapshot unchanged.
* For equal `completedAt` values, show later source entry first, matching append order's newest record. Keep commit rows in their existing order within each run.
* Add localized `completedAt` date and time to command-row summary, using same `toLocaleString` options already used by agent and commit rows. Preserve command status and output.
* Extend `action_run_history.test.tsx` with multiple command entries supplied oldest-first. Assert newest row renders first and each command row contains its localized completion date and time. Existing agent and commit-history behavior must remain covered.

## acceptance criteria

* Command-action popup lists run history from latest `completedAt` to earliest.
* Runs with equal completion timestamps use reverse source order, so later-appended run appears first.
* Every command run row shows status, output, and completion date and time in user's locale.
* Reordering display does not mutate loaded entries, persisted activity records, or history used by other consumers.
* Commit rows remain attached to correct run and retain their current order.
* Empty-history and history-load-error behavior remains unchanged.
* Updated focused tests pass independently.
