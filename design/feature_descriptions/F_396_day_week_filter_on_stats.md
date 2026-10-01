---
author: 
id: F_396
internalId: 945c9334-4a6a-4f98-b59e-38aaa853b5e6
title: Day week filter on stats
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__945c9334-4a6a-4f98-b59e-38aaa853b5e6.json
policy:
---

On the stats view  for most if not all reports, we have a day vs week filter. This works, but it resets whenever we change report.

We should remember this, just like we do with display style diagram vs table.

## Current state

`StatsMenuTab` offers Day/Week for Activity over time, Agent/model performance, and Project usage vs account usage; Activity also offers Month. `StatsControls` stores separate `activityGranularity`, `performanceGranularity`, and `usageGranularity` values, each initially Day. Changing dataset keeps those separate values, so the newly selected report can show Day after Week was chosen elsewhere. `ProjectStatsService` owns the controls and keeps them when Stats closes and reopens; chart/table choice is already shared across reports. Totals by Card/Action has no time granularity control.

## implementation details

* Make Day/Week one service-owned choice shared by the three reports with time granularity controls. A change in any report updates the choice used by the other two and rebuilds rows for the active report.
* Keep Month available only in Activity over time. Month does not replace the last Day/Week choice; a Day/Week-only report uses that last choice. Selecting Day or Week in Activity updates the shared choice.
* Update `StatsControls`, initial controls, `ProjectStatsService`, and the three dataset builders so menus and aggregation use the same effective granularity. Keep the choice across dataset switches and Stats close/reopen, matching chart/table choice. Reset it when the bound project changes or stats are cleared.
* Update `StatsMenuTab` to show the effective choice for each report. Totals remains without a granularity control. Add focused service and menu tests for switching among reports, Month handling, close/reopen, and project reset.

## acceptance criteria

1. Choosing Week or Day in any report with that control makes the same choice visible and effective in the other Day/Week reports when selected; chart and table rows use matching time buckets.
2. Choosing Month in Activity leaves the last Day/Week choice intact. Switching to Performance or Usage shows and uses that choice; returning to Activity restores Month until Day or Week is selected there.
3. The shared Day/Week choice survives switching reports and leaving/reopening Stats in the same project. A different project starts at Day.
4. Totals has no granularity control. Existing chart/table choice and date-range filtering continue to work.
