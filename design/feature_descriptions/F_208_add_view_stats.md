---
author: 
id: F_208
internalId: 8690b93e-98c4-486f-95b6-aacc10931a56
title: Add view stats
status: ready
owner: 
affects:
agents:
  - design/activity/card__8690b93e-98c4-486f-95b6-aacc10931a56.json
policy:
after: af16c33d-206a-4cbc-8ca9-488574f7d514
branch: f_208_add_view_stats
---
Add support to view stats like:

* Time per card, per action
* Counts of cards, actions per day, week, month
* Token usage per card, per action
* Token usage by time

Stats can be viewed in chart and saved as csv.

To view stats, in workspace, where list and board are, add statsview

Add button to ´board´, ´list´, group

## Current state

Workspace has two service-owned modes, `cards` and `text`, selected by Board/List buttons in `AppMenu`. `ProjectWorkspace`, `CardView`, `MobileCardView`, `TextView`, and mobile drawer navigation all assume those two modes. No stats surface, chart component, or chart dependency exists.

Card and project activity files contain terminal root-action records with card identity, action identity, status, and UTC timestamps. Agent conversations in those files contain card/action identity, cumulative token usage, completion time, and optional `timer`. `timer.elapsedMs` is measured running time: it accumulates only while conversation status is `running`, excluding time spent waiting for user input. New conversations persist it across pause, resume, completion, failure, and cancellation. Legacy conversations can lack `timer`; their duration cannot be reconstructed accurately from `startedAt` and `completedAt`.

`<projectFolder>/usage_metrics.csv` contains normalized per-turn token deltas with UTC `recorded_at` values. It is only source that can place token use reliably in time; conversation usage remains source for per-card and per-action token totals. Current activity stays in `<projectFolder>/activity`; released card activity moves below configured releases folder. Existing storage services can list and read all these repository files in local, GitHub, and remote-control modes.

## implementation details

* Extend `WorkspaceViewMode` with `stats`. Add Stats button beside Board and List in existing segmented control, on desktop and mobile. Add lifetime-stable `StatsView` to `ProjectWorkspace`; hide Board, List, their navigation, and open card details while stats mode is active. Reset new project to Board as today.
* Add singleton `ProjectStatsService`, initialized with active project, resolved project config, and `StorageService`. Service loads recognized current and released activity files plus `<projectFolder>/usage_metrics.csv` when stats view opens, refreshes after relevant repository changes, owns loading/error/data state, and publishes stable snapshots through `EventTarget`. React subscribes with `useSyncExternalStore` in smallest stats components.
* Parse activity with existing strict shared parser. A malformed required source makes stats load fail and reports through `dialogService`; do not silently publish partial totals. Missing `usage_metrics.csv` is valid and makes token-by-time unavailable. Legacy conversations without `timer` remain excluded from duration totals and produce visible coverage count; never substitute wall-clock timestamp difference.
* Define one **completed action run** as root activity record whose status is `completed` or `okButNotAfter` (`okButNotAfter` means root action completed but an after-action failed). Action count counts those records. Card count counts distinct card internal IDs having at least one such record in bucket. Project-scoped records do not count as cards. Nested before/on/after actions do not add root-run counts.
* Duration totals sum each terminal agent conversation's stored `timer.elapsedMs` once. Group by `actionId` for per-action time and by `cardInternalId` for per-card time. Include completed, failed, and cancelled conversations because each consumed measured running time; exclude running/waiting conversations until terminal. Command actions have no conversation timer and contribute no duration.
* Per-card and per-action token totals sum each canonical conversation's persisted usage once, using existing token-bucket math. Include legacy token baseline in total tokens but do not claim corrected bucket detail for it. Token-by-time uses only `token_usage` rows from `usage_metrics.csv`, grouped by `recorded_at`; never place cumulative conversation usage into latest completion bucket.
* Offer two chart datasets: activity over time (distinct cards, completed action runs, or token usage; Day/Week/Month granularity) and totals by Card/Action (measured duration or token usage). Apply one UTC date range to both. Day, ISO week (Monday start), and calendar month buckets use UTC boundaries. Render bucket timestamps and range controls in browser local timezone, with tooltip/accessibility text stating UTC bucket boundary.
* Build accessible bar chart from existing MUI/theme primitives; add no chart dependency. Each bar exposes category and exact formatted value. Card labels use loaded card ID/title where available, then stored card path, then internal ID. Action labels use stored action title/ID. Sort time buckets chronologically and category totals descending, with stable label tie-break.
* Export currently selected, filtered chart dataset as RFC 4180 CSV through browser download. Include dataset, grouping, UTC bucket start when applicable, stable card/action identity, display label, metric, unit, and exact value. Use local time only for display; exported timestamps stay UTC ISO-8601. Export does not modify project `usage_metrics.csv`.
* Add service tests for source discovery across current/released activity, successful-run counts, distinct cards, stored-timer sums, legacy timer coverage, terminal filtering, card/action token sums, time-token rows, UTC day/week/month buckets, malformed/missing sources, and refresh races. Add user-centric tests for third view mode, desktop/mobile visibility and navigation, controls, local labels, empty/error states, chart accessibility, and exact CSV export.

## acceptance criteria

* Board/List/Stats control switches among three exclusive workspace modes on desktop and mobile. Stats mode shows no board, text editor, file/card navigation, or stale card-details popup; returning preserves existing Board/List behavior.
* Activity-over-time chart shows distinct cards and completed root-action runs per UTC day, ISO week, or month. One card with multiple completed runs in bucket counts once; project-scoped runs count as actions but not cards.
* Per-card and per-action duration equals sum of persisted terminal conversation `timer.elapsedMs` values. Waiting-for-input time is excluded. Legacy missing timers, command actions, and active conversations are not estimated or included, and UI states omitted timer count.
* Per-card and per-action token totals count every canonical conversation once. Token-by-time uses per-turn `usage_metrics.csv` deltas, so resumed conversations, project reloads, card moves, and releases do not move or duplicate historical tokens.
* UTC boundaries determine date range and Day/Week/Month buckets. UI presents dates/times in user's local timezone and identifies underlying UTC boundary; CSV keeps UTC ISO-8601 timestamps.
* Current chart filters and grouping determine downloaded RFC 4180 CSV. Exported values equal chart values and download does not change project files.
* Missing stats data renders clear empty/unavailable state. Malformed required activity or metrics data reports error and renders safe error state instead of partial totals.
* Focused service/component tests, `npm run typecheck`, `npm run lint`, and affected app unit/UI tests pass.
