---
author: 
id: F_242
internalId: 9823580d-2b15-4386-9be1-66a94937fb3a
title: stats improvements
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__9823580d-2b15-4386-9be1-66a94937fb3a.json
policy:
after: d9aa7d07-b618-4b83-9802-799c88174fb5
---
* project usage vs account usage
  * keep same colors for same agents. lets prepare 2 sets of colors that differ enough (subset of the already created chart colors). for claude a set and for codex another set and always pick the colors sequentially, not randome. this way, we always have the same colors for the same agent or model, makes it easier to read the chart.
  * we already made the legends sticky to the left, but the titles should do the same.
  * we currently have an extra filter 'token values' with `average per action` and `totals` This is only applied to 'project token usage'
    instead of using a filter, lets just split this chart in 2, so we have 2 charts in the list: project token usage totals and project usage average per action. this way we can remove the filter.
  * since we have average token usage per action, per agent, we can also show 'average cost per action per agent', similar like we show 'tokens per dollar'
    and similar to 'project activity' and 'project token usage totals', we can also show 'total cost per agent per day?
* totals by card/action:
  * we show a tooltip per bar, good, but it shouldn't contain the path of the file of the card, just:
    {id}:{title}
    {value}&#x20;
    if value is time based, convert it to HH:MM:SS
  * the label below the bar should only contain the card id, not the agent or model.
  * for estimated cost:&#x20;
    * I'm not certain why we include the account name in the legend? here all we need to know: was it claude or codex, possibly which model.
    * I hope this is calculated as: sum of (tokens \* cost per token for agent used) for each action that was run by the card. This way, some cards can have actions with mixed agents. these should have a legend color of 'mixed'
  * make legend sticky to the left side for scrolling

## Current state

**Where the code lives.** Aggregation lives in `app/src/services/stats/`, the UI in `app/src/components/stats_view/`. Everything asked for here is either presentation (`stats_bar_chart.tsx`, `stats_usage_comparison_charts.tsx`) or row composition in two dataset builders (`stats_usage_comparison_dataset.ts`, `stats_totals_dataset.ts`). `buildSnapshot` recomputes all rows on every control change, so adding or removing a control needs no incremental-update work.

**Series colors.** `createSeriesColorMap` in `stats_bar_chart.tsx` walks the chart's distinct effective series identities **in first-appearance order** and hands each the next unused color from the single eight-entry `theme.palette.custom.chartPalette` (`app/src/theme/app_theme.ts:52`), falling back to retried random colors past eight. Two consequences: the color of one agent depends on which other series happen to be present, and each `StatsBarChart` allocates independently, so `claude` can be blue in *Account usage* and green in *Project token usage*. There is no notion of a per-provider color family.

**Sticky chart titles.** `stats_usage_comparison_charts.tsx` already sets `position: 'sticky', left: 0` on the heading `Typography`, but it does not stick. A sticky box can only be shifted **inside its own containing block**; the heading is a block-level element inside the `Paper`, so its width equals the `Paper`'s width and there is no room to shift — the offset is clamped to 0. The legend in `stats_bar_chart.tsx` looks identical but works, because it sits in a flex column (`Stack`) with `alignSelf: 'flex-start'`, which shrinks it to its content and leaves room to slide. `alignSelf` on the heading does nothing, since `Paper` is a block container, not a flex container.

**Token values filter.** `usageTokenAggregation` (`project_stats_types.ts`) with its `Token values` select in `stats_controls.tsx` switches `projectTokenRows` between the bucket token total and that total divided by the provider's completed agent actions in the same bucket, and switches the chart heading through the `CHARTS` label record. It applies to the `projectTokens` chart only, which is why it reads as a stray global filter.

**Cost in the comparison view.** There is none. `tokensPerDollar` derives dollars from the configured monthly subscription price and the account-series window duration. No chart shows dollars.

**Cost per token.** No agent profile carries a per-token price; `monthlySubscriptionCostUsd` is the only money in the model. Cost is therefore always *derived*: window-normalized dollars per percentage point × percentage points consumed. `seriesRates` in `stats_totals_dataset.ts` computes one rate per **account series** (`provider / limitId / windowId`) over the whole selected range, so a provider reporting several limit windows (claude reports a weekly and a 5-hour window) yields several competing rates.

**Totals by card/action.** `costTotalsRows` emits one row per *card × agent × account series*, so a single card produces several bars. `displayLabel` is `"<card id> / <provider> / <limitId> / <windowId>"`, which is also the text under the bar, and `seriesLabel` (the legend entry) is the same `provider / limitId / windowId` triple — that is where the account name in the legend comes from. Tooltips in this dataset are still the old semicolon strings (`totalRow`, `costRow`, `unavailableAgentRow`); `cardDisplay` (`stats_identities.ts`) builds `"<id>: <title>; <path>"`, which is where the file path in the tooltip comes from. Duration totals print raw milliseconds. The `Totals` chart legend is `StatsBarChart`'s own legend and is already sticky.

**Already delivered by F\_233.** The performance `Aggregation` select, the widened value labels, the labelled multi-line tooltip module (`stats_tooltip.ts`), and the local-time bucket formatting are implemented; the sticky heading was attempted but does not work, for the reason above.

## Implementation details

### 1. Per-agent color families

Add to `app/src/theme/app_theme.ts`, per mode, `chartPalettes: { claude: string[], codex: string[] }` built as disjoint subsets of the existing `chartPalette`, which stays unchanged and becomes the neutral fallback list:

* dark — claude `['#e0af68', '#f7768e', '#bb9af7', '#c0caf5']`, codex `['#7aa2f7', '#9ece6a', '#7dcfff', '#73daca']`
* light — claude `['#d97706', '#dc2626', '#7c3aed', '#64748b']`, codex `['#3366cc', '#2e8b57', '#0284c7', '#0f766e']`

Move color allocation out of `stats_bar_chart.tsx` into a new `app/src/components/stats_view/stats_series_colors.ts` exporting `assignSeriesColors(rows, palettes)`:

1. The **color group** of a row is `row.provider ?? row.agent ?? null`; a group matching a key of `chartPalettes` (case-insensitively) uses that family, anything else uses the neutral list.
2. Collect distinct effective series identities per group and sort them lexicographically, so allocation no longer depends on row order.
3. Assign sequentially from the group's palette. Grouped families are assigned first, the neutral group last, skipping any color already taken in this chart.
4. Past the end of a list, keep today's random-color-with-retry overflow.

Keep memoization by ordered identity list plus palette, as F\_238 requires. Same agent, same colors across every chart, because the family and the position within it are derived from the identity, not from render order.

### 2. Sticky headings

In `stats_usage_comparison_charts.tsx`, make the `Paper` a flex column (`display: 'flex', flexDirection: 'column'`) so the existing `alignSelf: 'flex-start'` takes effect, and add `width: 'max-content'` to the heading. The heading then shrinks to its text and its sticky offset has room to work.

### 3. Split project token usage, drop the `Token values` filter

* `project_stats_types.ts` — remove `StatsUsageTokenAggregation`, the `usageTokenAggregation` control and its `INITIAL_CONTROLS` entry; in `StatsChartRole` replace `projectTokens` with `projectTokensTotal` and `projectTokensAverage`.
* `stats_controls.tsx` — remove the `Token values` select and `handleUsageTokenAggregationChange`.
* `stats_usage_comparison_dataset.ts` — `projectTokenRows` emits **both** rows per bucket per provider: the total (`aggregation: 'total'`) and the per-action average (`aggregation: 'average'`, bucket tokens ÷ that provider's completed agent actions in the same bucket, `0` when there are no actions), each with its own `chartRole` and tooltip label.
* `stats_usage_comparison_charts.tsx` — two plain-string entries in `CHARTS`: `Project token usage (totals)` and `Project token usage (average per action)`. `label` becomes `string`; delete `chartLabel` and the `tokenAggregation` prop, and its pass-through in `stats_content.tsx`.

### 4. Cost charts in the comparison view

Add two `grouped` charts after `Tokens per dollar`: **`Estimated cost per agent`** (`chartRole: 'costPerAgent'`) and **`Average cost per action`** (`chartRole: 'costPerActionAverage'`), both `unit: 'dollars'`, one series per provider.

Rate rule (decided): each provider uses the account series with the **largest `windowDurationMinutes`**; ties break on the lexicographically smallest series identity. Add `longestWindowSeriesByProvider(seriesOptions)` to `stats_usage_comparison_dataset.ts` and reuse it in the totals dataset.

Per bucket, per provider, with `pointsUsed` the sum of positive `usedPercentDelta` of that series in that bucket, a fixed 28-day subscription month, and `dollarsPerPoint = monthlySubscriptionCostUsd / (100 * (40320 / windowDurationMinutes))`:

```
estimatedCost        = pointsUsed * dollarsPerPoint
averageCostPerAction = estimatedCost / completed agent actions of that provider in the bucket
```

**Note this consequence, and state it in the tooltip:** with a per-bucket rate the token term cancels out — `tokens / ((tokens / pointsUsed) / dollarsPerPoint)` reduces to `pointsUsed * dollarsPerPoint`. So the cost chart is the account-usage chart expressed as a window-normalized share of the subscription, not an independent measurement; the upside is that it stays correct when a bucket has account usage but no recorded project tokens. Emit `unavailableTimeRow` for a bucket when the provider has no positive delta or the profile has no `monthlySubscriptionCostUsd`; emit an unavailable row for the average when the action count is 0. Set `numerator` (actions or points) and `denominator` on the rows so the CSV keeps the inputs.

### 5. Totals by card/action: one bar per group, agent legend, mixed detection

In `stats_totals_dataset.ts`:

* `seriesRates` returns **one rate per provider**, from the longest-window series (same rule as above) over the selected range. Drop the per-series fan-out.
* `costTotalsRows` emits **one row per card (or action)**. Its value is `Σ over conversations of conversation.totalTokens / tokensPerDollar(conversation.agent)`, so a card whose actions ran on different agents is priced per action with that action's agent rate.
* Series identity and legend label: the single agent name when every counted conversation shares one agent, otherwise identity `mixed` with label `Mixed`. The account name, limit id and window id disappear from the legend. The model is not shown, because a card's actions routinely mix models within one agent.
* Conversations whose agent has no usable rate are skipped and add one tooltip line, `Skipped from estimate: <n> run(s) (<reason>)`. Priceable conversations still produce a subtotal; only a row with no priceable conversation stays `available: false` with value 0.
* `displayLabel` becomes the card id (or action label) alone, so the text under the bar carries no agent or model. Delete `unavailableAgentRow`, now covered by the unavailable branch above.

### 6. Totals tooltips

* `cardDisplay` (`stats_identities.ts`) — tooltip becomes `"<visibleId>: <title>"`; the path is dropped. The unknown-card fallback stays path-or-internal-id.
* Add `formatDurationHms(milliseconds)` to `stats_tooltip.ts`: always `HH:MM:SS`, hours zero-padded to two digits and allowed to exceed 99 for long totals. `formatDuration` in `conversation_duration.ts` is not reused: it drops the hours part below one hour and does not pad hours, and it is on the chat timer's hot path.
* Rewrite `totalRow` and the cost row to use `statsTooltip` / `accessibleStatsTooltip`, giving exactly two lines plus optional notes:

```
F_242: stats improvements
01:23:45
```

Line 1 is `<id>: <title>` for cards, the action label for actions. Line 2 is the formatted value: `formatDurationHms` for `milliseconds`, `formatCount` for tokens, currency for dollars. The cost row adds a `Priced with: <agent> subscription rate` line (or `Mixed agents`) and any not-priced note.

### 7. Sticky legend on totals

`StatsBarChart`'s legend is already sticky and works (it is shrink-to-fit inside a flex column). No change; cover it with a test so the geometry is not lost.

### Tests

* `stats_series_colors.node.test.ts` (new) — claude and codex identities draw from their own family, order-independence, neutral fallback, no duplicate color in one chart, overflow retry.
* `stats_bar_chart.test.tsx` — colors stable across value-only rerenders and across two charts with different row order; the totals legend stays sticky.
* `project_stats_service.node.test.ts` — both project-token charts present per bucket; the two cost charts and their unavailable branches; one cost row per card, with `Mixed` when agents differ and per-agent pricing when they do not; the `HH:MM:SS` and `<id>: <title>` tooltips; remove the `usageTokenAggregation` cases.
* `stats_csv.node.test.ts` — the new chart roles serialize with their `aggregation` values.
* `app_theme.node.test.ts` — the two families are disjoint and are subsets of that mode's `chartPalette`.

Verify with `npm run typecheck` and the vitest suites in `app/`.

## Acceptance criteria

* One agent keeps one color across every chart in the stats view and across renders: claude series draw only from the claude family, codex series only from the codex family, and the assignment depends on the series identity, not on the order rows arrive in.
* Series with no provider or agent (for example the per-action series in *Project activity*) take neutral colors that never collide with a color already used in the same chart.
* In *Project usage vs account usage*, each chart's heading stays pinned to the left edge while scrolling horizontally, exactly as its legend already does.
* The `Token values` select is gone. *Project usage vs account usage* lists both `Project token usage (totals)` and `Project token usage (average per action)`, each labelled with what it shows, the average being bucket tokens divided by that provider's completed actions in the same bucket.
* Two new charts appear: `Estimated cost per agent` (per bucket, per agent) and `Average cost per action`, in dollars, one series per agent, with buckets marked unavailable when the agent has no positive account usage or no configured monthly subscription cost.
* Cost tooltips state that the estimate normalizes the account limit window against a fixed 28-day subscription month, so it is never read as a metered per-token price.
* In *Totals by Card/Action*, each card or action is a single bar; its tooltip is exactly `<id>: <title>` on the first line and the value on the second, with no file path anywhere.
* Time-based totals in tooltips read as `HH:MM:SS`, not raw milliseconds.
* The label under a bar in *Totals by Card/Action* shows only the card id (or action label) — no agent, model, account or window.
* The estimated-cost legend names the agent, or `Mixed` for a card whose actions ran on more than one agent; no account name, limit id or window id appears in it.
* A mixed card's cost is the sum over its priceable conversations at each conversation's agent rate. Unpriceable runs are skipped and called out in the tooltip; they do not hide the subtotal.
* Where an agent reports several limit windows, exactly one rate is used per agent — the one from the longest window.
* The legend of *Totals by Card/Action* stays pinned to the left while scrolling horizontally.
* `npm run typecheck` and the `app/` vitest suites pass.
