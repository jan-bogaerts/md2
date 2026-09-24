---
author: 
id: F_360
internalId: 515b2369-553d-4556-b99c-e01eb575777d
title: Move stats toolbar to main app bar
status: ready
owner: 
affects:
agents:
  - design/activity/card__515b2369-553d-4556-b99c-e01eb575777d.json
policy:
changedFiles:
  - app/patch_stats_content_test.py
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/components/shell/menu/menu_select.tsx
  - app/src/components/stats_view/stats_menu_tab.test.tsx
  - app/src/components/stats_view/stats_menu_tab.tsx
after: 358764f1-3de7-4aaa-b7e9-b83da22beaa1
---

Similar like we did for diagrams, move the toolbar we show at the top of the stats page, to the main menu app bar. Only show the tab when in stats view.

## Current state

`StatsView` renders the stats surface whenever the workspace view mode is `stats`, and opens `projectStatsService` through an effect so repository reads start only when stats becomes visible. `StatsContent` is the single subscriber of that service through `useSyncExternalStore`; it returns early with a spinner while `snapshot.status` is `loading` and with an alert while it is `error`.

On success `StatsContent` renders, inside the stats page body: a `Project stats` heading, the `StatsControls` toolbar, warning lines, omitted-timer and excluded-sample notes, the usage-comparison disclaimer, and the chart panel. `StatsControls` is a wrapping flex row holding a caption (`Typography variant="caption"`) stacked above each control. Controls are: Dataset; the dataset-specific controls for `activityOverTime` (Metric, Granularity), `agentPerformance` (Metric, Aggregation, Grouping, Granularity, Actions, plus Agents or Models), `usageComparison` (Granularity) and `totals` (Grouping, Metric); then Releases, Token numbers, From (local time), To (local time), and an `Export CSV` button disabled when `snapshot.rows` is empty. Every change routes through the module-level `setStatsControls` helper, which calls `projectStatsService.setControls` and reports failures to `dialogService`.

The diagram precedent already exists. `AppMenu` declares `type AppMenuTab = 'home' | 'agents' | 'diagram'`, keeps `MENU_TABS` for the always-present tabs, appends `DIAGRAM_MENU_TAB` to `availableMenuTabs` only while `viewMode === 'diagrams'`, derives `visibleCurrentTab` so a hidden tab renders as `home`, and runs an effect that resets `currentTab` to `home` (through `queueMicrotask`) once the diagram view is left. Its panel renders `<DiagramMenuTab />` inside a `role="tabpanel"` box that is mounted only in diagram view. `DiagramMenuTab` is the subscriber boundary: it reads its own service snapshot with `useSyncExternalStore` and lays content out as `Tab` > `Section` groups separated by vertical dividers, using `MenuSelect` and `MenuIconButton`, which carry their label as tooltip plus `aria-label`. `Menu` and `Tab` fix the panel row at 52px with horizontal overflow scrolling, so there is no room for captions stacked above a control.

## implementation details

* Add a `StatsMenuTab` component in `app/src/components/stats_view/stats_menu_tab.tsx`. It subscribes to `projectStatsService` with `useSyncExternalStore` exactly as `StatsContent` does, so the app bar rerenders on control changes without `StatsContent` republishing anything. It accepts the service as an optional prop for tests, mirroring `DiagramMenuTab`.
* Move the control definitions out of `StatsControls` into `StatsMenuTab`. Keep the existing module-level change handlers and the `setStatsControls` wrapper (service call plus `dialogService.error` fallback) as they are; only presentation moves. Delete `stats_controls.tsx` once nothing references it, and remove the `<StatsControls snapshot={snapshot} />` line from `StatsContent`.
* Lay the tab out as `Tab` > `Section` groups separated by `Divider flexItem orientation="vertical"`: `Dataset` (dataset select), `View` (the dataset-specific selects, which stay conditional on `controls.dataset` exactly as today), `Filters` (Releases, Token numbers, date range button), `Export` (Export CSV). Drop every per-control `Typography variant="caption"` label.
* Replace each `Select` with `MenuSelect`, passing the former caption text as `label` so it becomes both tooltip and `aria-label`; existing accessible names (`Dataset`, `Activity metric`, `Performance grouping`, `Releases`, `Token number format`, ...) are preserved so current queries keep matching. The three multi-selects (Actions, Agents, Models) need `multiple` with `renderValue`, which `MenuSelect` does not support; extend `MenuSelect` with optional `multiple`/`renderValue` passthrough rather than adding a second select component.
* Replace the two inline `datetime-local` fields with one `MenuIconButton` labelled `Date range` (`DateRangeOutlined`) that opens a MUI `Popover` anchored to it, holding the existing From and To `TextField`s with their current captions and `aria-label`s (`Range start local time`, `Range end local time`). Changes apply immediately through the existing `handleStartChange`/`handleEndChange`, so closing the popover never discards a value and reopening reads the latest snapshot. Close on Escape or outside click. The anchor element is transient local state in the control; range values stay owned by `projectStatsService`.
* Render `Export CSV` as a `MenuIconButton` labelled `Export CSV` (`FileDownloadOutlined`), disabled when `snapshot.rows` is empty, calling the existing `exportStats(controls.dataset, rows)`.
* Disable every stats control while `snapshot.status` is `loading` or `error`. `StatsMenuTab` must not early-return a spinner or an alert the way `StatsContent` does, because the app bar row has to keep its height and the tab must stay selectable; it also must not report errors, since `StatsContent` already owns error and warning reporting and duplicating it would raise two dialogs per failure.
* In `app_menu.tsx`, extend `AppMenuTab` with `'stats'`, add `const STATS_MENU_TAB = { label: 'Stats', value: 'stats' }`, and build `availableMenuTabs` so the diagram tab is appended in `diagrams` view and the stats tab in `stats` view. Generalise `visibleCurrentTab` and the reset effect from the diagram-only check to any view-scoped tab, so selecting Stats and then switching to Board falls back to `home`.
* Render `{viewMode === 'stats' ? <Box role="tabpanel" ...><StatsMenuTab /></Box> : null}` next to the existing diagram tabpanel, keeping the mount-only-when-visible pattern so the stats service gains no subscriber outside stats view.
* Keep `StatsContent`'s `Project stats` heading, warning lines, omitted-timer and excluded-sample notes, usage-comparison disclaimer, and chart panel unchanged.
* Tests: move the control assertions from `stats_content.test.tsx` into a new `stats_menu_tab.test.tsx` (dataset switching, conditional control sets per dataset, release and token-format changes, date range popover open/change/close/reopen, Export CSV disabled on empty rows, controls disabled while loading or errored). Keep `stats_content.test.tsx` covering loading, error, notes and chart states, with the control queries removed. Extend `app_menu.test.tsx` with the stats-tab visibility and `home` fallback case, mirroring the existing diagram-tab test. Verify with `npm run typecheck` and the vitest suites.

## acceptance criteria

* In stats view the app menu shows a `Stats` tab next to `Home` and `Run`. In board, list and diagram views that tab is absent.
* Selecting the `Stats` tab and then leaving stats view selects `Home`; returning to stats view shows the `Stats` tab again, unselected, with control values unchanged.
* The `Stats` tab panel holds all stats controls, grouped as Dataset, View, Filters and Export sections with vertical dividers, in one 52px row that scrolls horizontally when it overflows.
* No control in the app bar shows a stacked caption; each exposes its former caption text as tooltip and accessible name, and existing accessible names are unchanged.
* Dataset-specific controls appear and disappear with the selected dataset exactly as before: Metric plus Granularity for activity over time; Metric, Aggregation, Grouping, Granularity, Actions and Agents-or-Models for agent/model performance; Granularity for usage comparison; Grouping plus Metric for totals.
* The Actions, Agents and Models selects stay multi-select, show `All` when empty and a comma-joined list otherwise.
* The `Date range` button opens a popover with the From and To local-time fields. Editing a field applies the range immediately; closing the popover keeps the value; reopening shows the current service values.
* `Export CSV` is disabled when no rows match the filters and otherwise downloads the same CSV as before.
* While stats data is loading or failed, the `Stats` tab and its controls are visible but disabled, and the error or warning dialog is raised once, by `StatsContent` only.
* The stats page body no longer renders the toolbar, and still renders the `Project stats` heading, warning lines, omitted-timer and excluded-sample notes, usage-comparison disclaimer, and chart panel.
* Changing any control in the app bar updates the chart without remounting the chart panel or reopening the stats session.
* `npm run typecheck` passes and the stats, app menu and diagram test suites pass.
