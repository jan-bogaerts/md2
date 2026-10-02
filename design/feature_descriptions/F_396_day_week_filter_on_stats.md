---
author: 
id: F_396
internalId: 945c9334-4a6a-4f98-b59e-38aaa853b5e6
title: Day week filter on stats
status: ready
owner: 
affects:
agents:
  - design/activity/card__945c9334-4a6a-4f98-b59e-38aaa853b5e6.json
policy:
after: e4aa0a7e-bcfd-4c1c-a665-9d9a2cf52918
---

On the stats view, three reports have a day vs week filter; Activity over time also offers month. The selected time granularity appears to reset whenever we change report.

We should remember this, just like we do with display style diagram vs table.

## Current state

`StatsMenuTab` offers Day/Week for Activity over time, Agent/model performance, and Project usage vs account usage; Activity also offers Month. `StatsControls` stores separate `activityGranularity`, `performanceGranularity`, and `usageGranularity` values, each initially Day. Changing dataset keeps those separate values, so the newly selected report can show Day after Week was chosen elsewhere. `ProjectStatsService` owns the controls and keeps them when Stats closes and reopens; chart/table choice is already shared across reports. Totals by Card/Action has no time granularity control.

## implementation details

* Make Day/Week/Month one service-owned choice shared by Activity over time, Agent/model performance, and Project usage vs account usage. A change in any report updates the choice shown and used by the other two and rebuilds rows for the active report.
* Update `StatsControls`, initial controls, `ProjectStatsService`, and the three dataset builders so menus and aggregation use the same granularity. Permit Month in performance and usage comparison granularity types and aggregation. Keep the choice across dataset switches and Stats close/reopen, matching chart/table choice. Reset it when the bound project changes or stats are cleared.
* Update `StatsMenuTab` to offer Day, Week, and Month in all three reports. Totals remains without a granularity control. Add focused service and menu tests for switching among reports, Month buckets in performance and usage comparison, close/reopen, and project reset.

## acceptance criteria

1. Choosing Day, Week, or Month in any of the three reports makes the same choice visible and effective in the other two when selected; chart and table rows use matching time buckets.
2. Month groups Performance and Usage rows by calendar month, as Activity already does.
3. The shared granularity survives switching reports and leaving/reopening Stats in the same project. A different project starts at Day.
4. Totals has no granularity control. Existing chart/table choice and date-range filtering continue to work.
