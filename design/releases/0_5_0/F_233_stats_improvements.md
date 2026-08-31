---
author: 
id: F_233
internalId: 2809caf7-2f00-4484-ba68-18306e01f965
title: stats improvements
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__2809caf7-2f00-4484-ba68-18306e01f965.json
policy:
branch: f_233_stats_improvements
changedFiles:
  - app/src/services/stats/project_stats_service.node.test.ts
  - app/src/services/stats/stats_subscription_cost.node.test.ts
  - app/src/services/stats/stats_subscription_cost.ts
  - app/src/services/stats/stats_totals_dataset.ts
  - app/src/services/stats/stats_usage_comparison_dataset.ts
  - design/feature_descriptions/F_224_add_subscription_costs.md
  - design/feature_descriptions/F_242_stats_improvements.md
after: 545671dd-18d4-4878-93b9-0ed24f2077fa
---
* agent/model performance:
  * we currently have metrics: measured duration, tokens and toolcalls.
    I believe these are all totals. this is fine, but we should also have average info. so add an extra select after 'metric' where the user can select: sum, average, average with stdev, mean. for average with stdev, we can draw a range on top of the bar?
    average should be per action.
  * currently all numbers are displayed above the bars, but the are truncated, the text can only be as wide as the bar. can we allow them to go wider and keep the text centered with the bar.
  * needs option to select which actions to include or all.&#x20;
* project usage vs account usage:
  * make the titles and legends sticky like in the other charts
  * currently all numbers are displayed above the bars, but the are truncated, the text can only be as wide as the bar. can we allow them to go wider and keep the text centered with the bar.
  * dates in the tooltips are just utc text i think, format them nicely to local time.
  * see tooltip: `21 Aug 2026, 02:00 – 22 Aug 2026, 02:00; UTC 2026-08-21T00:00:00.000Z to 2026-08-22T00:00:00.000Z; claude / default / weekly; 2642 percentage points; window 10080 minutes; reset 2026-08-23T17:00:00.000Z, 2026-08-23T16:59:00.000Z`
    this is just meaningless spaghetti
* project token usage:&#x20;
  * I think these are currently totals. that is ok, but it needs to say that these are totals
  * we need the ability to view totals and averages (per action)
* tokens per percent account usage:
  * tooltip: `21 Aug 2026, 02:00 – 22 Aug 2026, 02:00; UTC 2026-08-21T00:00:00.000Z to 2026-08-22T00:00:00.000Z; codex / codex / primary; 84343454 project tokens; 83 account percentage points; ratio 1016186.1927710844` again, poorly written. hard to read. 'percentage points' wtf?

## Current state

**Where the code lives.** Stats aggregation is in `app/src/services/stats/`; the UI is in `app/src/components/stats_view/`. A snapshot is rebuilt by `buildSnapshot` (`stats_snapshot_builder.ts`) every time `ProjectStatsService.setControls` is called, so any new control automatically triggers a full recompute — no incremental update path exists or is needed.

**Agent/model performance.** `performanceRows` (`stats_performance_dataset.ts`) buckets eligible conversations by UTC day or week, groups them by agent or by agent+model, and in `groupRow` computes `value = sum(metricValue) / sampleCount`. So today's bars are **already the arithmetic mean per conversation run**, not totals, for all three metrics (measured duration, tokens, tool calls). Nothing in the chart, the axis, or the control labels says "average", which is why the bars read as totals. There is no way to see the sum, no dispersion (spread) indicator, and no median.

**Action filter.** The requested "option to select which actions to include or all" already exists: `StatsControls.performanceActionIds` (`project_stats_types.ts`) is filtered in `matchesEntityFilters`, and `stats_controls.tsx` renders an "Actions" multi-select whose empty value renders as `All`. Only the agent/model performance dataset has it.

**Value labels above bars.** In `stats_bar_chart.tsx` the per-bar label `Typography` is absolutely positioned with `left: 0; right: 0` inside the bar's own wrapper `Box` and carries `noWrap`. Its line box is therefore exactly as wide as the bar, so any longer number is ellipsised. The same applies to the stacked-bar total label. The full text is only reachable through the `title` attribute (native hover tooltip).

**Sticky titles/legends in the comparison view.** `StatsBarChart` renders its legend with `position: 'sticky'; left: 0`, so the legend survives horizontal scrolling. The five chart headings in `stats_usage_comparison_charts.tsx` (`Account usage`, `Project token usage`, …) are plain non-sticky `Typography` inside a `width: 'max-content'` `Stack`, so they scroll out of view horizontally. The enclosing `Paper` uses `overflow: 'hidden'`.

**Tooltips.** Every dataset composes its tooltip as one semicolon-joined string inside the aggregator, and `StatsChartRow.tooltip` / `.accessibleLabel` carry it to the chart verbatim (`stats_chart_rows.ts`, `stats_usage_comparison_dataset.ts`, `stats_performance_dataset.ts`). `StatsBucketContext` already offers both a locale-formatted `localLabel` and a raw `interval` (`"<ISO start> to <ISO end>"`); the comparison tooltips print **both**, which is where the doubled date text comes from. Other defects visible in the two quoted tooltips: raw unrounded numbers (`ratio 1016186.1927710844`), the unexplained unit "percentage points", a raw window length in minutes, raw ISO reset timestamps, and the machine identity `claude / default / weekly` presented without labels.

**Project token usage chart.** `projectTokenRows` sums `totalTokens` per provider per bucket. It is a total, is not labelled as one, and has no per-action average.

**Tokens per percent account usage.** `ratioSeriesRow` divides project tokens in the bucket by the summed positive `usedPercentDelta` of one account limit window. "Percentage point" (pp) here means *one percent of that subscription window's quota consumed* — e.g. a weekly Claude limit going 40% → 42% used contributes 2 pp. The tooltip never explains this.

## Implementation details

### 1. Performance aggregation select

Add `performanceAggregation: 'average' | 'averageWithDeviation' | 'median' | 'sum'` to `StatsControls`, defaulting to **`'average'`** in `INITIAL_CONTROLS` so existing bars do not change meaning. Render a new `Select` in `stats_controls.tsx` immediately after the performance "Metric" select, labelled `Aggregation`, with items: `Sum`, `Average`, `Average ± std dev`, `Median`.

* Average is per conversation run (divide by `sampleCount`), which is what `groupRow` does today.
* `averageWithDeviation` uses the same bar value as `average`, plus the **population standard deviation** of the group's `metricValue`s (spread around the mean, in the same units as the metric).
* Median \= middle value of the sorted group; even counts average the two middle values.

Compute all of this in `groupRow`, keeping the single pass over `groupSamples`. Add one nullable field `deviation: number | null` to `StatsChartRow` (null for every row except `averageWithDeviation` performance rows) and default it to `null` in `emptyTimeRow`. Add it plus an `aggregation` column to the CSV in `stats_csv.ts`.

Deviation whisker in `stats_bar_chart.tsx`: when `row.deviation` is non-null, draw a thin absolutely positioned vertical line centred on the bar spanning `value − deviation` to `value + deviation` (clamped at the zero baseline), with short horizontal caps at both ends, reusing `scaledPosition` so it shares the bar's scale. `maximumMagnitude` must include `value + deviation` so the upper cap cannot be clipped.

### 2. Value labels wider than their bar

In `stats_bar_chart.tsx`, replace `left: 0; right: 0` on the per-bar label and on the stacked total label with `left: '50%'; transform: 'translateX(-50%)'; width: 'max-content'; maxWidth: BUCKET_WIDTH`, keeping `textAlign: 'center'` and dropping the clipping effect of `noWrap`. The label then grows symmetrically around the bar's centre and may overhang neighbouring bars. Keep `pointerEvents: 'none'` on the label wrapper so the overhang never steals hover from a neighbouring bar's tooltip. `maxWidth` is capped at one bucket width so two adjacent long labels cannot fully overlap; the `title` attribute stays as the fallback. Because `Paper` with `overflow: 'hidden'` in `stats_usage_comparison_charts.tsx` would clip a label overhanging the panel edge, add horizontal padding to the bucket row (or set that `Paper` to `overflowX: 'visible'`) so the first and last bucket labels stay fully readable.

### 3. Sticky headings in the comparison view

Give each chart heading in `stats_usage_comparison_charts.tsx` the sticky treatment the legend already has: `position: 'sticky'; left: 0; alignSelf: 'flex-start'; bgcolor: 'background.paper'; zIndex: 1`. Heading and legend then stay pinned to the left while bucket columns scroll horizontally. `StatsBarChart`'s legend is already sticky and needs no change.

### 4. Tooltip rewrite

Add one module, `app/src/services/stats/stats_tooltip.ts`, exporting a `statsTooltip(lines)` helper that renders `label: value` pairs joined by newlines, plus small formatters:

* `formatBucketRange(context)` → the existing local `localLabel` only; **drop the raw UTC ISO interval** from every tooltip. Append the short local time-zone name once (from `Intl.DateTimeFormat().resolvedOptions().timeZone`) so the reader knows the times are local.
* `formatTimestamp(iso)` → medium local date + short local time, used for `resetsAt`.
* `formatWindow(minutes)` → human text (`10080` → `7 days`).
* `formatCount(value)` → `Intl.NumberFormat` with at most 2 fraction digits.

Then rewrite each tooltip producer to emit labelled lines instead of a semicolon run-on. Target shapes:

*Account usage* (`accountSeriesRow`):

```
Mon 21 Aug 2026, 02:00 – Tue 22 Aug 2026, 02:00 (Europe/Brussels)
Provider: claude · Limit: default · Window: weekly (7 days)
Used this period: 26.42% of the weekly limit
Limit resets: Sun 23 Aug 2026, 17:00
```

Percentage points are shown as a percentage of that window's quota. When several reset times fall in one bucket, list the earliest and note `(+N more)`. When `available` is false, keep a single "percentage-point delta unavailable" line.

*Tokens per percent account usage* (`ratioSeriesRow`):

```
Mon 21 Aug 2026, 02:00 – Tue 22 Aug 2026, 02:00 (Europe/Brussels)
Provider: codex · Limit: codex · Window: primary
1,016,186 project tokens per 1% of account limit used
Project tokens: 84,343,454 · Account limit used: 83%
```

Round the ratio for display; the CSV keeps the unrounded `value`. Apply the same treatment to *Actions per percent account usage*, *Project token usage*, *Project activity*, the performance tooltip (which must now also name the aggregation: `Average duration per run`, `Median tool calls per run`, `Total tokens`, plus an extra `Std dev: …` line for `averageWithDeviation`), and `emptyTimeRow` / `unavailableTimeRow`.

`accessibleLabel` stays a single-line variant (newlines replaced by `; `) because screen readers read `aria-label` as flat text. The MUI `Tooltip` in `stats_bar_chart.tsx` needs `slotProps.tooltip.sx = { whiteSpace: 'pre-line' }` to render the newlines.

### 5. Project token usage: totals vs per-action average

Add `usageTokenAggregation: 'average' | 'total'` to `StatsControls`, default `'total'`, rendered as a `Select` labelled `Token values` (items `Totals`, `Average per action`) shown only when `dataset === 'usageComparison'`. In `projectTokenRows`, when `'average'` is selected, divide the bucket's provider token sum by the number of completed actions for that provider in the same bucket — `indexes.agentActionsByBucketProvider` already holds exactly that list — and emit `0` when the count is 0. Reflect the choice in the chart heading (`Project token usage (totals)` / `Project token usage (average per action)`) via the `CHARTS` table in `stats_usage_comparison_charts.tsx`, and in the tooltip line label.

### 6. Action filter for performance

No new work: the `Actions` multi-select already exists and already defaults to `All`. Confirm with a test that clearing it includes every action and that a selection narrows both the bars and the sample counts.

### Tests

Extend `project_stats_service.node.test.ts` for the four aggregations (including a hand-checked std dev and an even-count median), for the token totals/average switch, and for the per-action filter. Extend `stats_bar_chart.test.tsx` for the deviation whisker and the widened label geometry, and `stats_csv.node.test.ts` for the two new columns. Verify with `npm run typecheck` and the vitest suite.

## Acceptance criteria

* Agent/model performance shows an `Aggregation` select next to `Metric` with `Sum`, `Average`, `Average ± std dev`, and `Median`; it defaults to `Average`, and `Average` reproduces exactly today's bar values.
* `Sum` shows per-group totals; `Median` shows the middle run; `Average ± std dev` shows the mean bar with a centred vertical whisker spanning one population standard deviation either side, and the chart's vertical scale accommodates the upper cap.
* The performance tooltip names the aggregation and the metric explicitly (e.g. "Average duration per run"), so no bar's meaning has to be guessed.
* Numeric labels above bars are no longer truncated to bar width: they render fully, centred on their bar, growing in both directions, clipped only at the chart panel's edge.
* Long labels never block hovering the bar underneath or beside them.
* In "Project usage vs account usage", each chart's heading and legend stay pinned at the left edge while scrolling horizontally.
* No tooltip in the stats view contains a raw ISO-8601 timestamp or a duplicated date range. Every date and time is locale-formatted local time, with the time zone stated once per tooltip.
* Every tooltip is a labelled multi-line list; no semicolon run-on strings remain.
* "Percentage points" no longer appears unexplained: account usage and ratio tooltips express it as a percentage of the named limit window's quota.
* Ratios in tooltips are rounded for display; the exported CSV keeps full precision.
* The "Project token usage" chart states whether it shows totals or per-action averages, and a `Token values` select switches between them; the average divides bucket tokens by that provider's completed actions in the same bucket.
* The performance action filter includes all actions when empty and narrows bars plus sample counts when a subset is chosen.
* Exported CSV gains `aggregation` and `deviation` columns; existing columns and their order are unchanged.
* `npm run typecheck` passes and the stats test suites pass.