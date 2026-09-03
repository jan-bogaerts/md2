---
author: 
id: F_263
internalId: 29a27cb6-cc51-4457-9270-eab33d4550b1
title: stats add releases filter
status: ready
owner: 
affects:
agents:
  - design/activity/card__29a27cb6-cc51-4457-9270-eab33d4550b1.json
policy:
after: 72313751-3701-45e2-8c8c-59b095a770e2
changedFiles:
  - app/src/components/stats_view/stats_content.test.tsx
  - app/src/components/stats_view/stats_controls.tsx
  - app/src/services/stats/project_stats_loader.ts
  - app/src/services/stats/project_stats_service.node.test.ts
  - app/src/services/stats/project_stats_types.ts
  - app/src/services/stats/stats_activity_dataset.ts
  - app/src/services/stats/stats_options.node.test.ts
  - app/src/services/stats/stats_options.ts
  - app/src/services/stats/stats_performance_dataset.ts
  - app/src/services/stats/stats_snapshot_builder.ts
  - app/src/services/stats/stats_totals_dataset.ts
  - app/src/services/stats/stats_usage_comparison_dataset.ts
---

we already have a date from and to filter, we should add a 'releases' filter which only includes cards in the results that belong to the selected release or the current release.

## Current state

Stats loads activity from the configured current activity folder and every immediate release folder. `ProjectStatsLoader` merges those sources into one `ReleaseStats`, so release membership is lost before datasets are built. `StatsControls` offers one shared local-time date range, but no release control.

Current activity means activity still stored in the project's configured activity folder. A completed release means one immediate subfolder of the configured releases folder. Release membership comes from source location; card and conversation identity remain `cardInternalId` and conversation ID.

`usage_metrics.csv` rows have timestamps and provider usage, but no card or release identity. They cannot be assigned to a release.

## implementation details

* Add one service-owned release control. Default it to `Current release`; offer `Current release` plus every discovered completed release, sorted by release name. Do not add an `All releases` option.
* Preserve current and completed-release `ReleaseStats` separately in `LoadedStatsSource` instead of merging them before snapshot construction. Keep released-stat cache loading and persistence unchanged.
* Build activity, performance, totals, omitted-timer counts, and activity-derived usage-comparison rows from only selected release's action and conversation facts. Use canonical fact identities when filtering and deduplicating; do not use paths as card identity.
* Keep `usage_metrics.csv` token and account rows governed only by date range. Release selection must not imply release attribution for those rows. In usage comparison, activity-derived rows change with release selection while telemetry-only rows do not.
* Render `Releases` as single-select control beside shared date controls. Store selection in `ProjectStatsService`, reconcile it after reload, and fall back to `Current release` if selected completed release no longer exists.
* Update focused loader, service, options, controls, and component tests. Cover separate source partitions, default selection, completed-release selection, stale selection reconciliation, and unaffected usage telemetry.

## acceptance criteria

* Opening Stats selects `Current release` by default and includes only facts loaded from current activity folder.
* Releases control lists `Current release` and each discovered immediate completed-release folder exactly once, in stable name order.
* Selecting completed release excludes current and other releases from activity, performance, totals, timer-coverage counts, and activity-derived comparison results.
* Date range applies after release selection, so result must satisfy both selected release and selected time range.
* Changing release recomputes existing snapshot without rereading repository files.
* Missing activity for selected release produces existing empty state, not data from another release.
* After reload removes selected completed release, selection becomes `Current release` and results use current activity.
* Token and account rows from `usage_metrics.csv` remain date-filtered and unchanged by release selection because they contain no card or release identity.
* Focused app tests, typecheck, and lint pass.
