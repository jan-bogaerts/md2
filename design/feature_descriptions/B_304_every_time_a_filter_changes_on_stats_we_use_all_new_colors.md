---
author: 
id: B_304
internalId: 9595799d-16df-4378-9d4b-6b604ce606f6
title: every time a filter changes on stats we use all new colors
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__9595799d-16df-4378-9d4b-6b604ce606f6.json
policy:
after: 9e01cab5-8f41-4ea9-9ded-d6358a458537
---

Every time a filter changes, we use different colors for each series in the chart. this is not ok, we should always use the same colors. The same series should always use the same color on every chart, with any filter value.

in other words, remember the colors for each series label.

## Current state

* `app/src/components/stats_view/stats_series_colors.ts` keys colors by color group plus series identity (`seriesIdentity ?? identity`). Color group is `colorGroup ?? provider ?? agent`, matched against `theme.palette.custom.chartPalettes`; unmatched rows use neutral `chartPalette`.
* `allocateSeriesColors` sorts the series currently present, then gives slot 0, 1, 2… of each palette in that order. Slot depends on which series are visible: a filter that adds or removes one series shifts every later series to another color. Overflow colors come from `Math.random`.
* Nothing is remembered. `StatsBarChart` (`useAssignedSeriesColors`) recomputes colors from its own rows on every row change. `StatsSeriesColorProvider` does same across usage-comparison charts, so those charts share colors only with each other, not with other stats views.
* `ProjectStatsService` publishes new `rows` on every control change (`setControls` → `buildSnapshot`). Same label can appear in different charts with different identity or group, so it can get different colors today.
* Legend, vertical bars and `StatsHorizontalBarChart` look up color through `seriesColorKey(row, groupNames)`.

## implementation details

* Color key = series label: `seriesLabel ?? seriesIdentity ?? identity` (fallback only for single-series rows without label; those draw no legend). Same label → same color in every chart, any filter.
* Remember label slots in `ProjectStatsService` for app session: private `Map<label, { group, slot }>` plus per-group next-slot counter. Not cleared by `clear()`, `close()`, project switch or `setControls`; lost on app restart. Not persisted.
* In `publish`, before dispatching `changed`, register labels from new rows that are not yet known. Order new labels by group, then label, so one batch is deterministic. Group comes from first row seen with that label; later rows with same label but other group keep remembered slot. When at least one label was added, replace map reference and dispatch granular `seriesColorsChanged` event. Expose `getSeriesColorSlots` (stable reference) and `subscribeSeriesColors`.
* Replace `allocateSeriesColors` / `assignSeriesColors*` / `seriesColorInputs` with pure `resolveSeriesColors(slots, palettes)` returning `Map<label, color>`: family slot → `chartPalettes[group][slot]`; neutral slot → neutral palette with colors that occur in any family palette removed (so a later family series never changes an earlier neutral color). Slot past palette end → deterministic color from label hash, probing a bounded number of steps to avoid used colors; no `Math.random`.
* `seriesColorKey(row)` returns label key; drop `groupNames` parameter at all three call sites.
* `StatsBarChart` subscribes with `useSyncExternalStore(projectStatsService.subscribeSeriesColors, projectStatsService.getSeriesColorSlots)` and memoizes `resolveSeriesColors` on slots reference and serialized palettes. Remove `StatsSeriesColorProvider`, `StatsSeriesColorsContext` and `useAssignedSeriesColors`; `StatsUsageComparisonCharts` renders charts directly. Pass resolved map to `StatsHorizontalBarChart` as today.
* Tests: rewrite `stats_series_colors.node.test.ts` for `resolveSeriesColors` (family/neutral palettes, neutral skips family colors, deterministic overflow). Replace test `keeps a shared series identity inside each row agent family` — stale, contradicts label key. Add `ProjectStatsService` tests: label keeps slot after filter removes/re-adds other series, survives `close()`/re-open, event fires only when a new label appears. Add `stats_bar_chart.test.tsx` case: same label in two charts gets same swatch color. Run affected tests, typecheck, lint.

## acceptance criteria

* Changing any stats filter or control never changes color of a series label already shown in this app session.
* Same label (for example `codex`) has same color in every stats chart and view, including usage-comparison charts.
* Closing and reopening stats, or switching project, keeps remembered colors until app restart.
* New labels get next free color of their agent family palette; labels without family use neutral palette and never take a family palette color.
* Labels beyond palette length get a distinct color that is same every render.
* Legend swatch and bars of one label always match.