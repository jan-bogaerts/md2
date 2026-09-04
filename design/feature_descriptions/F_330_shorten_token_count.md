---
author: 
id: F_330
internalId: c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8
title: Shorten token count
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8.json
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Token count numbers can become big. We need to shorten them like 1.2K or 2M, 1.5K

Since this is shown in a lot of places, lets first make a small shared component to display this value, then use it everywhere tokencount is shown

## Current state

Terms used below: a **token count** is a whole number of provider-reported tokens, always the `totalTokens` field of `AgentTokenUsage` (`app/src/data/data_types.ts:351`) or a stats row whose `unit` is `'tokens'` (`StatsUnit` in `app/src/services/stats/project_stats_types.ts:27`). **Abbreviating** means replacing the grouped digits with a short magnitude form such as `1.2K` or `2M`. A **stats control** is one field of the `StatsControls` interface (`app/src/services/stats/project_stats_types.ts:46`), the object that backs every dropdown in the stats filter bar.

There is no shared token-count formatter today. Four call sites each build their own, and three of them hardcode the `en-US` locale:

1. `app/src/components/agents/agent_usage_display.tsx:4` holds a private `TOKEN_NUMBER_FORMAT`. The inline caption renders `tokens: {tokenCount(usage.totalTokens)}` on line 30, and the hover/focus tooltip repeats every bucket (total, input, cached input, output, reasoning) plus the reported cost.
2. `app/src/components/actions/run/popup/action_usage_summary.tsx:10` holds a private `NUMBER_FORMAT` shared with the insertions/deletions counters. It renders the active scope's total inline on line 147, and both scope totals inside the scope tooltip through `tokenValue` on line 73.
3. `app/src/components/shell/project_agent_usage_summary.tsx:41` calls `totalTokens.toLocaleString('en-US')` directly to build the status-bar button label. This surface has no tooltip of its own; the exact numbers live in the popover it opens, which renders `AgentUsageDisplay`.
4. `app/src/components/stats_view/stats_bar_chart.tsx` formats chart labels at render time from `row.value` and `row.unit`. `formattedValue` on line 36 special-cases `milliseconds`, `percent` and `dollars`, then falls through to a plain grouped number for every other unit including `tokens`. The stacked-bar total label on line 245 uses a bare `new Intl.NumberFormat()`.

Consequence: a run in the hundreds of thousands of tokens renders as `tokens: 428,913` in text sized `variant="caption"`, and inside the action popup that caption shares one flex row with the changes counter, which already collapses its own `tokens:` prefix below a 420px container width (see `USAGE_CONTROL_SX` and the `@container` rules in `action_usage_summary.tsx`). The number is the part that grows, and it is the part that cannot currently shrink.

Two neighbouring surfaces only look related and stay unaffected: `claude_rate_limit_details.tsx` and `codex_rate_limit_details.tsx` report a percentage of a window, never a token count.

Stats tooltips are not formatted at render time. Each `StatsChartRow` carries a `tooltip` and an `accessibleLabel` string baked in by the dataset aggregators through `statsTooltip` and `formatCount` (`app/src/services/stats/stats_tooltip.ts`), so a purely visual toggle cannot change them without rebuilding the snapshot. CSV export (`app/src/components/stats_view/stats_csv.ts`) writes the raw numeric `row.value` and is likewise independent of display formatting.

## Implementation details

The rule: **abbreviate the value a user reads at a glance; keep the exact grouped number wherever the user asked for detail.** Inline captions, buttons and chart bar labels abbreviate. Tooltips, stats row tooltips, and CSV export stay exact.

### 1. Shared component and formatter

New file `app/src/components/agents/token_count.tsx`, exporting both:

* `formatTokenCount(value: number): string` — the pure rule, so non-React call sites such as the stats chart can reuse it without rendering a component.
* `TokenCount({ value })` — renders the formatted text in a `<Box component="span">` and nothing else. It deliberately does **not** attach its own tooltip: every consuming surface either already owns a richer tooltip or reveals the exact numbers in the panel it opens, and a nested MUI `Tooltip` would fight the existing one.

The `formatTokenCount` rule, with `magnitude = Math.abs(value)`:

* `magnitude < 1_000` — the integer itself, no suffix. `999` gives `999`, `0` gives `0`.
* `magnitude < 1_000_000` — `value / 1_000` with `maximumFractionDigits: 1` and suffix `K`. A trailing `.0` never appears because `maximumFractionDigits` drops it: `1000` gives `1K`, `1234` gives `1.2K`, `15234` gives `15.2K`.
* `magnitude < 1_000_000_000` — the same against `1_000_000` with suffix `M`; above that, against `1_000_000_000` with suffix `B`.
* **Carry rule:** rounding to one decimal can push the mantissa to 1000, as `999950` would round to `1000.0K`. After rounding, a mantissa of 1000 or more promotes to the next suffix and is recomputed, so `999950` gives `1M` and `999999950` gives `1B`.
* Rounding is the default half-expand of `Intl.NumberFormat`. Negative values keep their sign and follow the same thresholds.
* Locale is the user default, `new Intl.NumberFormat(undefined, ...)`, not the hardcoded `en-US` of the current call sites. Below 1000 no grouping separator exists, so the switch is invisible there; above 1000 the only locale-sensitive character is the decimal separator.

### 2. Replace the four call sites

1. `agent_usage_display.tsx:30` — the inline caption becomes `tokens: <TokenCount value={usage.totalTokens} />`. The tooltip string keeps `TOKEN_NUMBER_FORMAT`, so total, input, cached input, output, reasoning and the cost stay exact. `COST_NUMBER_FORMAT` is untouched.
2. `action_usage_summary.tsx:147` — the inline value inside the tokens `ButtonBase` becomes `<TokenCount value={activeUsage.tokens.totalTokens} />`. `tokenValue` on line 73, which feeds the scope tooltip, keeps `NUMBER_FORMAT`. The insertions and deletions counters keep `NUMBER_FORMAT` in both places; this feature does not touch change counts.
3. `project_agent_usage_summary.tsx:41` — `totalLabel` is a plain string used both as the `value` prop of `MobileStatusRow` and as the desktop `Button` child, so it calls `formatTokenCount` rather than the component, producing the abbreviated number followed by the word `tokens`. The `Usage unavailable` branch is unchanged. Exact totals remain one click away in `ProjectAgentUsageDetails`.
4. `stats_bar_chart.tsx` — see the next section.

### 3. Stats: a user-controlled toggle

Abbreviation in stats is a user choice rather than forced, and the switch sits with the other filters.

* Add `shortTokenCounts: boolean` to `StatsControls` (`project_stats_types.ts:46`) and default it to `true` in `INITIAL_CONTROLS` on line 170.
* `stats_controls.tsx` — add a `Stack` shaped like the existing ones, labelled `Token numbers`, holding a `Select` with `aria-label="Token number format"` and two items, `Shortened (1.2K)` and `Exact (1,234)`, wired through a `handleTokenFormatChange` that calls `setStatsControls({ shortTokenCounts: value === 'short' })`. Place it next to `Releases`, outside the per-dataset conditionals, because token values appear in three of the four datasets.
* `ProjectStatsService.setControls` (`project_stats_service.ts:84`) currently rebuilds the whole snapshot through `buildSnapshot` on every change. `shortTokenCounts` changes nothing in the aggregated rows, so short-circuit it: when the only changed key is `shortTokenCounts`, publish the existing snapshot with the new controls and return before `buildSnapshot`. The range validation above it still runs.
* `stats_bar_chart.tsx` — add an optional prop `shortTokenCounts?: boolean` defaulting to `false`, so existing tests and any other caller keep today's output. In `formattedValue`, when the flag is on and `row.unit === 'tokens'`, return `formatTokenCount(row.value)`. Apply the same condition to the stacked total label on line 245, which needs the bar's unit passed down alongside the total. The units `tokensPerDollar` and `tokensPerPercentagePoint` are ratios rather than counts and keep their existing two-decimal formatting.
* `stats_content.tsx:105` and `stats_usage_comparison_charts.tsx:63` pass `shortTokenCounts={snapshot.controls.shortTokenCounts}`.
* `row.tooltip`, `row.accessibleLabel` and the CSV export stay exact and are not touched, so the precise number is always recoverable by hovering a bar or exporting.

### 4. Tests

New: `app/src/components/agents/token_count.test.tsx`, covering the boundaries `0`, `999`, `1000`, `1234`, `15234`, `999950` (carry to `1M`), `1000000`, `2000000`, `999999950` (carry to `1B`), a billions value, and a negative value.

Update: `app/src/components/agents/agent_usage_display.test.tsx` — the inline assertion `tokens: 1,284` becomes `tokens: 1.3K`, while the tooltip assertion `total: 1,284, input: 1,000, cached input: 234, output: 40, reasoning: 10, reported cost: $0.0125` stays byte for byte unchanged. The zero case is unchanged. Add a case proving inline and tooltip disagree by design.

Verify unchanged, since every token fixture in them is below 1000 and they must keep passing untouched: `project_agent_usage_summary.test.tsx`, `action_usage_summary.grouped.test.tsx`, `action_usage_summary_owner.grouped.test.tsx`, `action_popup.test.tsx`, `card_view.test.tsx`.

Extend: `stats_bar_chart.test.tsx` with a rows fixture at `value: 428913`, asserting `428.9K` when `shortTokenCounts` is on and `428,913` when off, plus a `dollars` and a `percent` row proving other units are unaffected; the `project_stats_service` tests for the new control default and for the no-rebuild short-circuit; the `stats_controls` and `stats_view` tests for the new select.

## Acceptance criteria

1. `formatTokenCount` produces exactly: `0` to `0`, `999` to `999`, `1000` to `1K`, `1234` to `1.2K`, `15234` to `15.2K`, `999950` to `1M`, `2000000` to `2M`, `999999950` to `1B`. No output ever ends in `.0`.
2. The action popup tokens control shows the abbreviated value inline, and its scope tooltip still shows both scopes as exact grouped numbers followed by the word `tokens`. Clicking it still toggles scope.
3. `AgentUsageDisplay` shows `tokens: 1.3K` inline for a total of 1284, and its tooltip still reads `total: 1,284, input: 1,000, cached input: 234, output: 40, reasoning: 10, reported cost: $0.0125`.
4. The status-bar project usage button shows the abbreviated total followed by `tokens`, on both the desktop button and the mobile row, and the popover it opens still exposes the exact totals through `AgentUsageDisplay`.
5. Token counts below 1000 render exactly as they do today on every surface, so no existing test fixture in the verify-unchanged list needs editing.
6. The stats filter bar has a `Token numbers` control offering shortened and exact, visible for every dataset, defaulting to shortened.
7. With the control on, bar labels and stacked-bar totals for `tokens` rows are abbreviated; with it off they are grouped exactly as today. Rows with unit `dollars`, `percent`, `milliseconds`, `tokensPerDollar` or `tokensPerPercentagePoint` render identically in both states.
8. Switching the `Token numbers` control re-renders the chart without rebuilding the stats snapshot: the published row array is the same object before and after the toggle.
9. Stats bar tooltips, accessible labels, and exported CSV values remain exact in both states.
10. `npm run typecheck` passes and the full test suite passes.
