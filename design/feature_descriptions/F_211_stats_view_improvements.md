---
author: 
id: F_211
internalId: ad4126b2-1203-4a30-b222-636148bf92b1
title: stats view improvements
status: design
owner: 
affects:
agents:
  - design/activity/card__ad4126b2-1203-4a30-b222-636148bf92b1.json
policy:
---

[F_208_add_view_stats.md](F_208_add_view_stats.md) added the stats view. Improve its chart layout and extend it to answer:

* Which actions were completed over time?
* Which agent or model uses the most measured time, tokens, or tool calls for all actions or selected actions?
* How quickly does each provider account limit drain relative to completed project work and project token usage?

## Current state

`ProjectStatsService` loads current and released activity plus `<projectFolder>/usage_metrics.csv`. It currently provides:

* completed root-action and distinct-card counts over UTC day, ISO week, or calendar month;
* project token usage over time from per-turn `token_usage` rows;
* cumulative conversation duration and token totals grouped by card or action; and
* one flat vertical bar series.

The chart scrolls horizontally but not vertically. It repeats the category below every bar, uses long local date-time labels, does not create empty time buckets, and combines card ID and title into the axis label.

Activity already contains the data needed for cumulative agent-action performance. A root activity record contains the root conversation ID and the agent/model used. The referenced conversation contains its cumulative measured timer, cumulative token usage, final status, final completion time, action ID, and timestamped provider events. Continued runs intentionally update the same conversation, so the resulting values represent the complete action conversation rather than individual runs.

Tool-call events already have a timestamp, event type, entry ID, and usually a provider item ID. No new tool-call persistence is required.

`usage_metrics.csv` contains both project-scoped `token_usage` rows and account-wide `account_usage` observations. The renderer currently validates account rows but discards them. Account observations are keyed by provider, limit ID, window ID, window duration, and reset time. Different limits and windows are not interchangeable and must never be summed into one account value.

## Definitions

### Completed action

A completed action is a terminal root activity record with status `completed` or `okButNotAfter`. Nested before/on/after actions do not create additional completed-action counts.

### Agent-action sample

One agent-action sample is one canonical root agent conversation, including all of its continuations. It is not one run or one provider turn.

For example, if an action conversation is started and continued twice, and its final cumulative values are 20 minutes, 500,000 tokens, and 30 tool calls, the stats contain one sample with those values. The number of runs is irrelevant.

Include a sample only when all of the following are true:

* the conversation is the `rootConversationId` of at least one agent activity record;
* every activity record referencing it as root has the same non-empty agent and model;
* none of those records contains nested agent conversations; until nested agent actions are introduced, this means `conversationIds` contains no conversation other than the root conversation;
* its final status is `completed`, `failed`, or `cancelled`;
* it has a final `completedAt` value; and
* the selected metric is available.

Failed and cancelled samples are included because their time, tokens, and tool calls are consumed resources. Exclude running and waiting conversations, conversations with missing agent/model attribution, conversations with mixed agent/model attribution across continuations, legacy conversations without a timer when duration is selected, and any future action containing nested agent conversations.

The complete cumulative value belongs to the UTC day or week containing the conversation's final `completedAt`. Therefore, a time chart means "actions completed in this period," not "resources consumed during this period."

### Agent-action metrics

* **Measured duration:** cumulative `conversation.timer.elapsedMs`. It excludes time waiting for user input.
* **Tokens:** cumulative `conversation.usage.totalTokens`, including any legacy baseline already represented in that total. A conversation without usage has zero tokens.
* **Tool calls:** count unique saved tool invocation events in the conversation. Deduplicate by `providerItemId` when present and otherwise by event entry ID. Count attempted tools regardless of success because failed calls also consume resources. Include Claude `tool.*` events except `tool.result`, and Codex command execution, file change, MCP tool, dynamic tool, collaboration tool, web search, and image-view events. Exclude messages, reasoning, plans, diagnostics, context compaction, mode changes, and tool-result events.

### Account usage

Account usage is the sum of valid `used_percent_delta` values for one provider, limit ID, and window ID in a time bucket. An empty first-observation delta contributes no value. Preserve negative corrections and render them below the zero baseline.

Account usage is account-wide. It can include other projects and external CLI sessions, so the UI must describe its relationship with this project's tokens and completed actions as a comparison, not as project attribution.

## Charts and controls

Use one common date range for all charts. Day, ISO week, and calendar month continue to use UTC boundaries. Range inputs remain local-time controls, while tooltips and CSV identify the UTC boundaries.

The Dataset control offers:

* Activity over time
* Agent/model performance
* Project usage versus account usage
* Totals by Card/Action

Only show controls that apply to the selected dataset. Preserve each dataset's last valid selections when switching datasets. If a selected action, agent, model, provider, limit, or window is no longer present after reload, clear that selection instead of retaining an invalid filter.

### Activity over time

Render one stacked vertical bar per time bucket:

* X-axis: Day, Week, or Month.
* Y-axis: completed root actions.
* Stack: root action ID.
* Color: stable per action across every bucket.
* Bar label: total completed actions only.
* Legend: action labels and colors in the upper-left of the chart.
* Tooltip: local bucket label, UTC bucket interval, total, and per-action counts.

Keep the existing distinct-card and project-token metrics as single-series alternatives. Distinct cards must not be stacked by action because one card can complete several actions in one bucket.

When a date range is selected, create every UTC bucket intersecting that range, including zero-value buckets. Without an explicit range, create every bucket between the first and last matching data point. Short labels are:

* Day: `18 Aug`
* Week: `W34 - 17 Aug`
* Month: `Aug 2026`

### Agent/model performance

Render grouped vertical bars:

* X-axis: Day or Week.
* Y-axis: average measured duration, tokens, or tool calls per included agent-action sample.
* Series/grouping: Agent or Model.
* Action filter: All actions or one or more selected action IDs.
* Agent/model filter: All values or one or more selected values.

When grouping by model, display `agent - model` so identical model names from different agents remain distinguishable. Use stable series colors and show the series in a legend.

For each bar, calculate `sum(metric) / included sample count`. The tooltip and accessible label show the exact value, included sample count, and status breakdown for completed, failed, and cancelled samples. Show the total number of excluded samples and the reasons above the chart. Do not silently treat unavailable values as zero, except a present conversation without token usage, which is defined as zero tokens.

Keep a time bucket on the X-axis when no eligible sample completed in it, but do not render an average bar for a series with a zero sample count.

### Project usage versus account usage

Render three vertically aligned charts with the same Day or Week X-axis:

1. Project activity: completed actions stacked by action.
2. Project token usage: token totals grouped by provider.
3. Account usage: percentage-point change for the selected provider, limit ID, and window ID.

Do not use one bar or a dual Y-axis for tokens and percentages. Do not sum different account limits or windows. Provide Provider, Limit, and Window controls populated from the available account series. The account tooltip shows provider, limit, window duration, percentage-point delta, and reset time.

The aligned charts provide the comparison needed to see whether account usage is draining faster than project work is completed. Include a visible note that account usage may include work outside this project.

### Existing totals by card or action

Keep the existing totals dataset and its duration/token metrics. When grouped by card, use only the visible card ID as the chart label. Show the full card title and path in the tooltip and accessible label. Preserve the existing fallback to stored path and then internal ID when a loaded card descriptor is unavailable.

## Chart layout and interaction

* Put the chart in a viewport with automatic horizontal and vertical scrolling. The chart content may grow beyond the viewport in either direction without pushing other workspace content outside its bounds.
* Show only the formatted value on or above a bar. Do not repeat the metric or series name on every bar.
* Put series names in a legend at the upper-left.
* Use a reusable theme-backed chart palette with light and dark values. Do not hardcode colors in chart components.
* Keep exact values and complete context in tooltips and accessible labels.
* Use a visible zero baseline for account corrections and other series that can contain negative values.
* Preserve current loading, empty, unavailable, warning, and safe error states.

## Service and data changes

* Extend `ProjectUsageMetricsService` token rows to retain their provider, and return valid account rows with provider, limit ID, window ID, window duration, reset time, used percent, optional used-percent delta, and recorded time. Continue warning and skipping malformed account rows without making valid token data unavailable.
* Build canonical root-conversation samples in `ProjectStatsService` by joining activity records through activity origin plus `rootConversationId`. Count each canonical conversation once even when several continuation records reference it.
* Detect nested agent conversations, mixed agent/model attribution, missing metric coverage, and other exclusion reasons while building samples. Publish exclusion counts with the chart snapshot.
* Extend chart rows or introduce chart-specific datasets with bucket identity, series identity, stack identity, value, sample count, status counts, tooltip metadata, and stable export identity. The current flat `StatsChartRow` cannot represent grouped and stacked series.
* Generate missing time buckets after applying the date and entity filters, so the displayed domain reflects the selected data.
* Keep all aggregation and filtering in the stats service. React components only select controls and render service snapshots.
* Extend the existing MUI/theme-based chart components; do not add a chart dependency.
* Continue exporting the currently selected and filtered dataset as RFC 4180 CSV. Grouped/stacked exports contain one row per bucket and series, including UTC bucket start, series identity, metric, exact value, sample count when applicable, and status counts for agent/model performance.

Likely affected files:

* `app/src/services/stats/project_stats_service.ts`
* `app/src/services/agents/project_usage_metrics_service.ts`
* `app/src/components/stats_view/stats_controls.tsx`
* `app/src/components/stats_view/stats_bar_chart.tsx`, split into focused chart components where grouped, stacked, and account charts need different behavior
* `app/src/components/stats_view/stats_content.tsx`
* `app/src/components/stats_view/stats_csv.ts`
* app theme configuration for the reusable chart palette

## Compatibility and edge cases

* Existing activity and metrics files remain valid; this feature requires no persistence migration.
* Legacy conversations without timers remain usable for token and tool-call metrics but are excluded only from duration.
* Empty or unavailable account metrics do not prevent activity or agent/model charts from rendering.
* One malformed account row produces a warning and is skipped. Malformed required activity or token rows retain the existing safe error behavior.
* Zero-value buckets remain interactive and accessible even when their visual bar has only the minimum visible height.
* Stable action, agent, model, provider, limit, and window identities determine colors and CSV identities; display labels do not become identities.
* A conversation changing agent or model across continuations is excluded rather than attributed arbitrarily.
* A future root action containing nested agent conversations is excluded from agent/model performance until nested conversations persist their own agent/model attribution.

## Testing

Add service tests for:

* zero-filled UTC day, ISO-week, and month ranges;
* stacked action counts and stable series identities;
* canonical conversations counted once across continuations;
* cumulative duration, tokens, and unique tool-call counts;
* completed, failed, and cancelled inclusion;
* running, waiting, missing-timer, missing-attribution, mixed-attribution, and nested-agent exclusions;
* final-completion bucket assignment;
* averages, sample counts, status counts, and exclusion counts;
* account-row parsing, negative corrections, provider/limit/window separation, and missing account data;
* card ID labels with title/path tooltip metadata; and
* grouped and stacked CSV rows.

Add user-centric component tests for:

* chart-specific controls and valid option combinations;
* stacked legends, grouped series, short dates, and zero buckets;
* horizontal and vertical overflow behavior;
* value-only bar labels and complete tooltips/accessibility text;
* agent/model sample and exclusion coverage;
* account scope warning and negative baseline; and
* card ID labels with full title in the tooltip.

## Acceptance criteria

* Activity over time displays completed actions as stable-color stacked bars and creates zero-value buckets for missing dates.
* Agent/model performance displays average cumulative measured duration, tokens, or tool calls per eligible root action conversation, grouped by agent or model and filterable by action.
* Continued conversations contribute one cumulative sample. Failed and cancelled conversations are included. Unmeasurable or ambiguous conversations are skipped with visible reason counts.
* Duration uses the stored cumulative measured timer.
* Project token usage and account percentage-point changes are shown on aligned charts with separate scales. Different account limits/windows are never summed.
* The UI states that account metrics can include work outside the project.
* Charts scroll automatically in both directions, show values without repeated series labels, use upper-left legends, and use short date labels.
* Card grouping uses the visible ID on the chart and the complete title/path in tooltip and accessibility text.
* CSV export matches the selected chart, filters, buckets, series, values, and sample/status counts.
* Existing activity and metrics files require no migration.
* Focused service/component tests, `npm run typecheck`, `npm run lint`, and affected app unit/UI tests pass.
