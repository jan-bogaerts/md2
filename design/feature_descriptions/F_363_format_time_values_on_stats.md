---
author: 
id: F_363
internalId: b5b62998-1de2-4ebd-ba9c-9f6e68b2d180
title: format time values on stats
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__b5b62998-1de2-4ebd-ba9c-9f6e68b2d180.json
policy:
branch: f_363_format_time_values_on_stats
worktree: 2
---

we have a couple of diagrams on the stats view that show time information, like duration of a task. we currently just show the raw number, but this is hard to read, can we convert it to hh:mm:ss format?

## Current state

Every chart on the stats view renders through `StatsBarChart` (`app/src/components/stats_view/stats_bar_chart.tsx`). Rows carry a `unit` field, and `'milliseconds'` is the unit for every duration metric: the totals dataset with `totalsMetric === 'duration'` and the agent-performance dataset with `performanceMetric === 'duration'` (`performanceUnit` at `app/src/services/stats/stats_performance_dataset.ts:99`).

One HH:MM:SS formatter already exists: `formatDurationHms` in `app/src/services/stats/stats_tooltip.ts:45`. It floors to whole seconds and zero-pads each part, and its doc comment records that `formatDuration` in `conversation_duration.ts` is deliberately not reused because that one drops hours below one hour and sits on the chat timer's hot path. Today `formatDurationHms` has exactly one caller: `formatTotalsValue` in `app/src/services/stats/stats_totals_dataset.ts:73`, plus the "Share" line at line 190. So totals tooltips are already correct, and nothing else is.

Three places still emit raw or decimal-seconds durations:

* `formattedValue` (`stats_bar_chart.tsx:41`) is the label printed above every non-stacked bar. For `'milliseconds'` it divides by 1000 and appends the word "seconds", so an average run of 280 ms reads `0.28 seconds` and a 90-minute total reads `5,400 seconds`.
* `totalLabel`, computed inside the bar loop of `stats_bar_chart.tsx`, is the label printed above a stacked bar's full height. It ignores `unit` entirely and runs `new Intl.NumberFormat().format(total)` on the raw value, so a stacked duration bar reads `5,400,000`. This affects both stacked duration modes: totals with `totalsMetric === 'duration'` (`chartMode === 'stacked'`) and agent performance split into reasoning/tool/other components (`chartMode === 'groupedStacked'`, see `isStackedDurationPerformance`).
* `formattedMetricValue` (`stats_performance_dataset.ts:120`) builds every agent-performance tooltip value: the aggregation line, the `Std dev` line, the `Share` line, and the per-run average split lines. All of them read "N seconds".

The CSV export (`app/src/components/stats_view/stats_csv.ts`) writes `row.value` unformatted alongside a `unit` column that already says `milliseconds`.

## implementation details

* Move nothing. Keep `formatDurationHms` in `app/src/services/stats/stats_tooltip.ts` and import it from the chart component; `stats_bar_chart.tsx` already imports `StatsUnit` from `services/stats/project_stats_types`, so the direction of the dependency is established.
* Sub-second durations floor to `00:00:00`. This is the decided behaviour, not an oversight: one rule for every duration surface, at the cost of sub-second detail in labels and tooltips. Do not add a millisecond branch.
* In `formattedValue` (`stats_bar_chart.tsx`), replace the `unit === 'milliseconds'` branch with `formatDurationHms(row.value)`. Leave the `tokens`, `percent`, `dollars`, and fallback branches untouched.
* In the same file, make `totalLabel` unit-aware: when `bar.rows[0].unit === 'milliseconds'`, use `formatDurationHms(total)`; otherwise keep the current token-abbreviation and `Intl.NumberFormat` behaviour. The existing `abbreviatesTokens` check stays first.
* In `formattedMetricValue` (`stats_performance_dataset.ts`), return `formatDurationHms(value)` for `'milliseconds'` and leave the `toolCalls`/`tokens` branch as is. This changes all four tooltip line kinds at once, which is intended: they must not disagree with each other.
* `formatTotalsValue` in `stats_totals_dataset.ts` already calls `formatDurationHms`; leave it alone.
* Leave `stats_csv.ts` unchanged. The `value` column stays raw milliseconds so exports remain machine-readable, and the `unit` column already names the unit.
* Negative and unavailable rows keep today's handling: `formattedValue` returns `'Unavailable'` before any unit branch, and `formatDurationHms` already clamps negatives to zero via `Math.max(..., 0)`.
* Tests to update: `app/src/services/stats/project_stats_service.node.test.ts:751` expects `Average duration per run: 0,28 seconds\nStd dev: 0,15 seconds`; under the new rule both become `00:00:00`, so raise that fixture's durations to values above one second rather than asserting a zeroed string. Keep the existing HH:MM:SS totals test at line 1034.
* Tests to add: a `StatsBarChart` case asserting a non-stacked `'milliseconds'` bar label renders HH:MM:SS, and a stacked `'milliseconds'` case asserting the stack total label renders HH:MM:SS rather than a grouped number.

## acceptance criteria

* A non-stacked duration bar on the stats view is labelled `HH:MM:SS`, for example `01:30:00` for ninety minutes, with the hour part zero-padded to two digits and free to exceed 99 for long totals.
* A stacked duration bar's total label is `HH:MM:SS`, not a raw millisecond count. This holds for the totals duration chart and for the grouped-stacked agent-performance duration chart.
* Every agent-performance duration tooltip line is `HH:MM:SS`: the aggregation line, `Std dev`, `Share`, and each per-run split component.
* Totals duration tooltips keep the `HH:MM:SS` they already render, and their `Share` line still reads `<percentage> of HH:MM:SS`.
* A duration under one second renders `00:00:00`.
* Token, tool-call, percent, dollar, and ratio charts are unchanged: no HH:MM:SS appears on any non-duration bar or tooltip.
* An unavailable row still renders `Unavailable` rather than `00:00:00`.
* The exported CSV still carries raw millisecond values in the `value` column with `milliseconds` in the `unit` column.
