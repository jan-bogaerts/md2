---
author: 
id: B_151
internalId: 12faf0b2-355c-4860-b04b-6d5523a5c137
title: issues in stats
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__12faf0b2-355c-4860-b04b-6d5523a5c137.json
policy:
after: cc3a9c43-319b-4a60-a202-f728f220e14e
---

Fix inconsistent bar layout and make project/account comparison show Claude and Codex together.

## Current state

`ProjectStatsService` supplies rows to one `StatsBarChart`, which renders single, grouped, and stacked modes. Current behavior has these defects:

* Action labels in legends, bars, tooltips, and totals append internal action IDs.
* Stacked activity bars are vertically centered instead of sharing the bottom baseline. Grouped bars also use different baseline and width rules from other charts.
* Bucket width grows with grouped series. Two bars on one day or week therefore widen that X-axis tick instead of sharing its fixed bar slot.
* Zero or unavailable account rows still receive the minimum visible bar height. These rows cause the unexplained light bar in empty buckets.
* `Project usage versus account usage` selects one provider, limit, and window. This prevents same-day comparison of Claude and Codex. Account usage lacks consistent bucket labels, appears last, and project activity appears first.
* Project activity remains stacked only by action. It cannot show separate Claude and Codex bars in one bucket.
* No derived chart divides project tokens or completed project actions by account percentage-point usage.

Account rows are distinct by provider, limit ID, and window ID. Several series can exist for one provider. Raw CSV can contain negative `used_percent_delta` corrections when provider telemetry moves backwards; these rows are invalid for this stats view and must be skipped without rewriting the CSV.

## implementation details

* Display action name only in chart labels, legends, tooltips, accessibility text, filters, and totals. Keep action ID as stable row, color, filter, and CSV identity.
* Give all bar charts one shared bucket width, bar-slot width, baseline, corner treatment, spacing, and value-label layout. Positive bars start at bottom baseline. Stacked segments grow upward from it.
* Keep each day/week tick width fixed. When a bucket contains multiple grouped bars, divide its existing bar slot equally among them; do not widen tick. Apply same rule to agent/model performance and usage-comparison charts.
* Do not draw a minimum-height bar for zero or unavailable values. Keep bucket label and accessible unavailable/zero context where needed.
* Rename dataset to `Project usage vs account usage`. Remove provider, limit, and window controls. Render every provider + limit ID + window ID as separate stable series, grouped side by side within each bucket. Hide a series when its summed valid account usage over selected range is zero.
* Skip negative account deltas before bucket totals, visibility checks, and ratio calculations. Do not change `usage_metrics.csv`, parsing, or collection behavior.
* Order comparison charts from top to bottom: Account usage, Project token usage, Tokens per percent account usage, Actions per percent account usage, Project activity. Give every chart same day/week labels and aligned bucket domain.
* Split Project activity into one bar per agent in each bucket. Stack that agent's completed actions by action ID. Keep command actions in a separate `Command` bar so completed-action totals do not change. Extend calculated action facts with action type and agent; update stored release-stats schema/version because released facts otherwise lack this attribution.
* Calculate ratios separately for each provider + limit + window series and UTC bucket:
  * tokens per percent account usage = project token total for same provider / positive account percentage-point usage;
  * actions per percent account usage = completed agent-action count for same provider / positive account percentage-point usage.
* Omit a ratio bar when denominator is missing or zero. Negative deltas are already skipped. Command actions have no provider and do not contribute to actions-per-percent ratios.
* Keep account-scope note: account usage may include other projects and external CLI sessions. Ratios compare project work with account-wide consumption; they do not attribute all account usage to project.
* Extend `StatsChartRow` roles/data as needed for grouped-stacked activity and ratio charts. Keep aggregation, filtering, series visibility, and ratio math in `ProjectStatsService`; React only renders snapshot.
* Update CSV export with displayed provider/limit/window series, agent grouping, and ratio rows while retaining stable IDs and exact unrounded values.
* Add service tests for action-name display, action attribution, fixed series identities, negative-delta skipping, zero-series hiding, per-provider ratios, missing/zero denominators, command actions, aligned buckets, and release-stats migration. Add component tests for shared baselines/widths, grouped-stacked activity, chart order, labels, removed controls, hidden empty bars, legends, tooltips, and accessibility text.

Likely affected files:

* `shared/project_stats.mjs` and `shared/project_stats.d.mts`
* `app/src/services/stats/project_stats_service.ts`
* `app/src/components/stats_view/stats_controls.tsx`
* `app/src/components/stats_view/stats_bar_chart.tsx`
* `app/src/components/stats_view/stats_usage_comparison_charts.tsx`
* `app/src/components/stats_view/stats_csv.ts`
* focused tests beside these files

## acceptance criteria

* Every visible action label contains action name only; internal ID remains stable identity but is not displayed.
* All positive bars start at same bottom baseline. Stacked activity grows upward. All charts share bar styling and fixed tick width.
* Multiple bars divide one bucket's fixed bar slot. Adding Claude beside Codex does not widen day/week tick.
* Zero and unavailable account values do not render colored minimum-height bars.
* Dataset label reads `Project usage vs account usage`; provider, limit, and window filters are absent.
* Account chart appears first and Project activity last. Every comparison chart shows same day/week labels and aligned buckets.
* Every non-zero provider + limit + window series is visible side by side. Series totaling zero over selected range are hidden.
* Negative account deltas are ignored by displayed totals and ratios; persisted CSV remains unchanged.
* Project activity shows separate Claude, Codex, and Command bars per bucket, with each bar stacked by action and total completed-action count unchanged.
* Separate ratio charts show project tokens and completed provider actions per positive account percentage point for matching provider series. Missing or zero denominators render no ratio bar.
* Tooltips, accessibility labels, and CSV identify bucket, provider, limit, window, agent/action grouping, numerator, denominator, and exact derived value where applicable.
* Account-scope warning remains visible.
* Focused unit/UI tests, `npm run typecheck`, `npm run lint`, and affected app tests pass.
