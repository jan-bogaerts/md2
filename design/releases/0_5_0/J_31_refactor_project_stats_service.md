---
author:
id: J_31
internalId: b7885271-1cd8-4927-9f68-661c0d87a61f
title: refactor ProjectStatsService into focused modules
status: ready
owner:
affects:
policy:
agents:
  - design/releases/V_0_5_0/card__b7885271-1cd8-4927-9f68-661c0d87a61f.json
after: a2f851ba-744e-4b53-bc9b-33e1eaa6787a
---

`app/src/services/stats/project_stats_service.ts` combines source discovery, released-stat caching, session state, control reconciliation, time bucketing, four dataset aggregators, and presentation metadata. Split it without changing behavior.

## Current state

`app/src/services/stats/project_stats_service.ts` is 1133 lines in one module. It exports every public stats type, the `findStatsSourcePaths` helper, the `ProjectStatsService` class, and the `projectStatsService` singleton. Inside one file it holds:

* Public types and constants: 12 exported type aliases, `StatsControls`, `StatsChartRow`, `StatsOptions`, `ProjectStatsSnapshot`, plus module-private `INITIAL_CONTROLS`, `INITIAL_SNAPSHOT`, `EMPTY_OPTIONS`, and `TERMINAL_CONVERSATION_STATUSES`.
* Source discovery: `normalizePath`, `recognizedCurrentActivityPath`, and `findStatsSourcePaths`, which splits repository files into current-activity paths and per-release activity paths.
* Released-stat cache handling: `ProjectStatsService.loadReleasedStats` reads `projectStatsFilePath(...)`, parses it, calculates only the releases missing from the cache, and commits an updated stats file when the release set changed and the load was not aborted.
* Time bucketing: `utcBucketStart`, `nextUtcBucket`, `isoWeekNumber`, `shortBucketLabel`, `localBucketLabel`, `inRange`, `bucketDomain`, `rowContext`.
* Option building and control reconciliation: `buildOptions`, `optionList`, `modelIdentity`, `accountSeriesIdentity`, `retainValidSelections`, `reconcileControls`.
* Four dataset aggregators: `activityRows`, `performanceRows` (with `sampleExclusion`, `performanceMetricValue`, `eligibleSamples`), `usageComparisonRows` (with `projectTokenRows`, `comparisonAccountRows`, `comparisonActivityRows`, `ratioRows`, `visibleAccountSeries`), and `totalsRows`.
* Presentation metadata: `emptyTimeRow`, `unavailableTimeRow`, `cardDisplay`, `actionLabel`, `accountSeriesLabel`, and the per-row `tooltip`/`accessibleLabel` strings each aggregator composes.
* Lifecycle: `bindProject`, `clear`, `open`, `close`, `setControls`, `load`, `isCurrentLoad`, `publish`, guarded by `loadRevision` and an `AbortController`, publishing through a `changed` `EventTarget` event.

"Reason to change" below means: a change request that touches one of these concerns currently forces an edit to this one file, so unrelated concerns share a merge surface and a test surface.

### Known hot spots

Every aggregator re-scans the full record array once per bucket, so cost is bucket-count x record-count:

* `activityRows` filters `actionRecords` (or `tokenRows`) inside `buckets.flatMap`/`buckets.map` for each of the three metrics.
* `projectTokenRows` filters `tokenRows` once per bucket **per provider**.
* `comparisonAccountRows` filters `source.accountRows` once per bucket **per account series**.
* `ratioRows` filters `source.accountRows` and then `source.tokenRows` or `source.stats.actions` once per bucket **per series**, and runs twice (token ratio and action ratio).
* `comparisonActivityRows` filters `actionRecords` once per bucket.
* `performanceRows` filters `entityFiltered` once per bucket.
* `visibleAccountSeries` calls `buildOptions(source)` a second time (after `buildSnapshot` already built options) and filters `accountRows` once per series.

`performanceRows` also builds groups with `groups.set(identity, [...(groups.get(identity) ?? []), sample])`, copying the group array on every sample.

### Verified import surface

* `app/src/services/project/project_loading.ts:28` — imports `projectStatsService`; binds and clears project state.
* `app/src/components/stats_view/stats_view.tsx:3` — imports `projectStatsService`, `StatsCardDescriptor`; opens and closes one viewing session.
* `app/src/components/stats_view/stats_content.tsx:4` — imports `projectStatsService`, `StatsExclusionReason`; subscribes to snapshots.
* `app/src/components/stats_view/stats_controls.tsx:5-11` — imports `projectStatsService`, `ProjectStatsSnapshot`, `StatsChartRow`, `StatsControls`, `StatsDataset`; updates controls and triggers CSV download.
* `app/src/components/stats_view/stats_bar_chart.tsx`, `stats_usage_comparison_charts.tsx`, `stats_csv.ts` — type-only imports of `StatsChartRow`, `StatsChartRole`, `StatsDataset`.
* Tests: `project_stats_service.node.test.ts` (imports `findStatsSourcePaths`, `ProjectStatsService`, `StatsCardDescriptor`), `stats_view.test.tsx`, `stats_content.test.tsx`, `stats_bar_chart.test.tsx`, `stats_csv.node.test.ts`.

## Current call sites

* `project_loading.ts`: bind and clear project state; keep current behavior.
* `stats_view.tsx`: open and close one viewing session; keep current behavior.
* `stats_content.tsx`: subscribe to snapshots; keep current behavior.
* `stats_controls.tsx`: update controls; keep current behavior.
* Chart and CSV components: import snapshot/row types; move imports to a dedicated types module.
* Service and component tests: preserve public behavior and coverage.

No verified call site needs different service behavior. Do not add modes or compatibility flags.

## Refactor

* Keep `ProjectStatsService` responsible only for lifecycle, binding, loading coordination, control updates, snapshot publication, and `EventTarget` notifications.
* Move public stats types and constants to `project_stats_types.ts`.
* Move UTC range/bucket logic to pure `stats_time_buckets.ts` functions.
* Move activity, performance, usage-comparison, and totals aggregation into separate pure dataset modules.
* Move source discovery, released-stat cache loading, and cache persistence into a focused loader owning those dependencies.
* Build indexes by bucket and identity once per snapshot. Remove repeated full-array filtering per bucket.
* Generate tooltip and accessibility metadata with each dataset row, not in React.
* Update call sites directly. Do not create re-export shims or forwarding methods.

## Edge cases

Preserve UTC boundaries, zero-filled buckets, numeric-zero unavailable rows, stable identities/colors, canonical conversation deduplication, exclusion reasons, partial-source warnings, load cancellation, and released-stat cache writes.

## Implementation details

All new modules live in `app/src/services/stats/` and use lowercase snake_case file names, per `design/architecture/architectural_decisions.md`. Every module below is pure (no service state, no I/O) except `project_stats_service.ts` and `stats_source_loader.ts`.

### Target modules

| Module | Owns | Moved from today's file |
| --- | --- | --- |
| `project_stats_types.ts` | Public stats types and shared constants. | All exported `Stats*` type aliases and interfaces, `ProjectStatsSnapshot`, `StatsCardDescriptor`, plus `INITIAL_CONTROLS`, `INITIAL_SNAPSHOT`, `EMPTY_OPTIONS`, `TERMINAL_CONVERSATION_STATUSES`, and the internal `LoadedStatsSource`/`EligibleSample`/`StatsProjectBinding`/`StatsCalculator` shapes. Types only, no runtime logic beyond those constants. |
| `stats_time_buckets.ts` | Pure UTC range and bucket maths. | `utcBucketStart`, `nextUtcBucket`, `isoWeekNumber`, `shortBucketLabel`, `localBucketLabel`, `inRange`, `bucketDomain`, `rowContext`, plus the new indexing helper below. |
| `stats_chart_rows.ts` | Row construction and presentation metadata. | `emptyTimeRow`, `unavailableTimeRow`, `cardDisplay`, `actionLabel`, `accountSeriesLabel`, and the shared row builder that stamps `tooltip` and `accessibleLabel` on every row it returns. |
| `stats_options.ts` | Option lists, identities, control reconciliation. | `buildOptions`, `optionList`, `modelIdentity`, `accountSeriesIdentity`, `retainValidSelections`, `reconcileControls`. |
| `stats_activity_dataset.ts` | `activityOverTime` rows. | `activityRows`. |
| `stats_performance_dataset.ts` | `agentPerformance` rows. | `sampleExclusion`, `performanceMetricValue`, `eligibleSamples`, `performanceRows`. |
| `stats_usage_comparison_dataset.ts` | `usageComparison` rows. | `visibleAccountSeries`, `comparisonAccountRows`, `projectTokenRows`, `comparisonActivityRows`, `ratioRows`, `usageComparisonRows`. |
| `stats_totals_dataset.ts` | `totals` rows. | `totalsRows`. |
| `stats_snapshot_builder.ts` | Dataset dispatch and snapshot assembly. | `buildSnapshot` and the `omittedTimerCount` / `excludedSampleCount` derivations. |
| `stats_source_loader.ts` | Source discovery, released-stat cache read/compute/persist, stat merging. | `normalizePath`, `recognizedCurrentActivityPath`, `findStatsSourcePaths`, `mergeStats`, and the body of `loadReleasedStats` as a free function taking `(binding, repositoryFiles, releaseActivityPaths, signal, calculateStats)`. |
| `project_stats_service.ts` (kept) | Lifecycle only: `bindProject`, `clear`, `open`, `close`, `setControls`, load coordination, revision and abort guarding, `publish`, `subscribe`, `getSnapshot`, and the `projectStatsService` singleton registration. | -- |

`project_stats_types.ts` must not import any other stats module, so no import cycle can form. Dataset modules import types, buckets, chart rows, and options only. `stats_snapshot_builder.ts` imports the four dataset modules. `project_stats_service.ts` imports the snapshot builder and the source loader.

### Indexing (the performance change)

Add one helper to `stats_time_buckets.ts`:

`groupByBucket<T>(records: T[], granularity: StatsGranularity, timestampOf: (record: T) => string): Map<string, T[]>` — a single pass that calls `utcBucketStart` once per record.

Each dataset builds its indexes **once**, before iterating buckets, then reads `index.get(bucket) ?? []`:

* `stats_activity_dataset.ts`: one index over in-range action records, one over in-range token rows.
* `stats_usage_comparison_dataset.ts`: token rows indexed by `provider` then bucket; account rows indexed by `accountSeriesIdentity(row)` then bucket; agent actions indexed by `agent` then bucket for the action-ratio numerator; one index over in-range action records for `comparisonActivityRows`. Build these once for the whole dataset and pass them to `comparisonAccountRows`, `projectTokenRows`, `comparisonActivityRows`, and both `ratioRows` calls, so the two ratio roles share one set of indexes.
* `stats_performance_dataset.ts`: index the entity-filtered samples by bucket once; build each bucket's groups with `push` on an existing array instead of rebuilding the array per sample.
* `stats_totals_dataset.ts` already runs one pass and only needs the `cardsById` map it builds today.

Nested indexes are `Map<string, Map<string, T[]>>` keyed by identity then bucket start; a missing key yields the empty array, which is what the current `filter` returns.

`buildOptions` is called exactly once per snapshot in `stats_snapshot_builder.ts`; the resulting `StatsOptions` is passed into `usageComparisonRows`, so `visibleAccountSeries` no longer rebuilds it.

Row ordering must be preserved exactly. Today's aggregators emit rows in bucket order, and within a bucket in `localeCompare` order of the grouping key (or provider/series order). Indexed lookups return insertion order, so every place that today relies on a sorted `[...map.entries()]` keeps that sort.

### Behavior that must not change

* Snapshot publication stays a `changed` event on the service's own `EventTarget`; `subscribe` keeps returning the unsubscribe function; `getSnapshot` stays an arrow-function field. No listener maps, no republishing beyond the existing single snapshot object.
* `close()` still increments `loadRevision`, aborts the controller, clears `cards` and `source`, calls `projectUsageMetricsService.clear()`, and publishes `INITIAL_SNAPSHOT` **with the current `controls` preserved**.
* `bindProject` still clears when the `${id}:${branch}` project key changes.
* `setControls` still validates both range timestamps with the strict ISO round-trip check, still throws `Invalid stats startUtc` / `Invalid stats endUtc` and `Stats start date must not be after end date`, and still publishes controls-only when no source is loaded.
* `load` keeps its `isCurrentLoad(revision, binding, signal)` guard after each await, and keeps the `Promise.all` of current-stats calculation and released-stats loading.
* The `StatsCalculator` constructor injection point stays, so tests keep substituting a fake calculator.

### Call-site updates

Update imports in place; no re-export shims, no forwarding methods:

* `stats_bar_chart.tsx`, `stats_bar_chart.test.tsx`, `stats_usage_comparison_charts.tsx`, `stats_csv.ts`, `stats_csv.node.test.ts` — import row, role, and dataset types from `project_stats_types`.
* `stats_controls.tsx` — types from `project_stats_types`, singleton from `project_stats_service`.
* `stats_content.tsx`, `stats_view.tsx`, and their tests — same split.
* `project_loading.ts` — unchanged import of the singleton.
* `project_stats_service.node.test.ts` — import `findStatsSourcePaths` from `stats_source_loader`, `StatsCardDescriptor` from `project_stats_types`, `ProjectStatsService` from `project_stats_service`.

### Tests

Keep `project_stats_service.node.test.ts` covering lifecycle, load cancellation, released-stat cache reads and writes, and control validation. Move the assertions that only exercise pure aggregation into focused sibling tests next to the module they cover, for example `stats_time_buckets.node.test.ts` and `stats_activity_dataset.node.test.ts`. Coverage of each existing assertion must survive the move: do not drop cases, and do not weaken an end-to-end snapshot assertion into a unit assertion where the end-to-end path is what was being protected.

## Acceptance criteria

### Structure

* `project_stats_service.ts` contains lifecycle, binding, load coordination, control updates, snapshot publication, and event notification only: no bucket maths, no aggregation, no row construction, no file discovery, no cache I/O.
* Each module listed in the implementation table exists, owns one responsibility, and is imported directly by its consumers.
* No module re-exports another module's symbols for compatibility, and no method on `ProjectStatsService` forwards to an extracted function purely to preserve an old import path.
* `project_stats_types.ts` imports no other stats module; the stats module graph is acyclic.

### Performance

* No dataset iterates buckets while filtering a full record array inside the loop; every per-bucket lookup reads a pre-built index.
* `buildOptions` runs at most once per published snapshot.
* Per-bucket group accumulation uses in-place `push`, not array-copy-on-insert.

### Behavior parity

* Identical snapshots for identical inputs: same rows, same order, same `tooltip` and `accessibleLabel` strings, same `identity` / `seriesIdentity` / `stackIdentity` values, same `available` flags.
* Preserved: UTC bucket boundaries, zero-filled buckets, numeric-zero unavailable rows, stable identities and colors, canonical conversation deduplication by identity in `mergeStats`, exclusion reasons and counts, partial-source warnings and their order, load cancellation semantics, and released-stat cache writes including the "changed and not aborted" write condition and the commit message.
* No CSV schema change, no `project_stats` persistence schema change, no public service lifecycle change, and no new constructor parameters beyond the existing `StatsCalculator` injection.
* Tooltip and accessibility strings are produced by the dataset modules with each row; React components read them and do not compose them.

### Verification

* `npm run test:unit`, `npm run typecheck`, and `npm run lint` pass. Do not use `npm run build` to check types.
* Every assertion in today's `project_stats_service.node.test.ts` still runs, either in place or in the focused module test it moved to.

## See also

* `design/feature_descriptions/F_211_stats_view_improvements.md`
* `design/feature_descriptions/J_29_investigate_and_improve_stats_load_speed.md`
* `design/architecture/architectural_decisions.md`
