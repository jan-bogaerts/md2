---
author: 
id: F_405
internalId: a7e89248-b83d-4ce4-b168-59e482d8adbc
title: Stats release filter allow all and selection
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__a7e89248-b83d-4ce4-b168-59e482d8adbc.json
policy:
---

On the stats view, we have a release filter. This works, but we should add 2 more things:

* Select multiple releases
* Select all releases

## Current state

`StatsMenuTab` offers one release at a time: Current release or one completed release. `StatsControls.releaseIdentity` stores that choice; `buildSnapshot` uses only its action and conversation facts for all four reports. `ProjectStatsLoader` already loads current and completed release facts. Release choices come from available release folders, including empty releases. Closing and reopening Stats keeps the choice; a removed choice falls back to Current release.

`usage_metrics.csv` token and account rows are project-wide and have no release identity. Existing time-based token and account series therefore stay the same when the release choice changes. CSV export uses the displayed rows.

## implementation details

* Replace single `releaseIdentity` control with a selection that distinguishes All releases from an explicit list of release identities. Keep Current release as default. Offer independent choices for Current release and each completed release, plus an All releases choice that includes both. Empty list means no release facts; distinguish it from All in the control label.
* In `buildSnapshot`, combine action and conversation facts from selected releases before building options and report rows. Deduplicate by each fact's canonical `identity`, so a fact present in two sources counts once. Build action, agent, and model filter options from the combined facts; retain still-valid entity selections when release selection changes.
* Reconcile selected identities against available releases after reload: retain surviving choices, including empty releases; if a previously nonempty list loses every choice, fall back to Current release. Preserve an intentionally empty list. Make All include newly available completed releases. Keep selection across report switches and Stats close/reopen; reset it to Current release for a different project.
* Apply combined facts consistently to Activity over time, Agent/model performance, Totals by Card/Action, and action-derived series in Project usage vs account usage. Keep project-wide `usage_metrics.csv` token and account series unchanged, because those rows cannot be attributed to a release. Date range, other filters, chart/table views, and CSV export continue to use the resulting rows.
* Update service, options, and menu tests for single, multiple, All, empty, removed, and newly added releases; duplicate facts; cross-report aggregation; project-wide telemetry; and exported rows.

## acceptance criteria

1. Release filter starts at Current release. User can select any subset of Current release and completed releases. All releases includes current and every completed release; clearing every choice shows no release facts, not All.
2. Each report aggregates action and conversation facts from selected releases once per canonical fact identity. Performance entity filters offer values from selected releases. Empty release folders add no facts.
3. Changing releases updates charts, tables, and exported CSV to the same filtered rows. Date range and other controls still work. Project-wide token and account telemetry remains unchanged by release selection.
4. Selection survives report switches and closing/reopening Stats in the same project. After reload, removed releases drop from a nonempty selection; if none remain, Current release is selected. An intentionally empty selection stays empty. All includes completed releases added since the previous load. A different project starts at Current release.
